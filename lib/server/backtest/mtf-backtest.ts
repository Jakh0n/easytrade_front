import { calculateATRSeries } from "../services/indicators.series";
import { computeStructure } from "../services/fq-strategy/structure";
import { evaluateSignalOutcome, SIGNAL_MAX_BARS } from "../services/fq-strategy/outcome";
import { resolvePending } from "../services/smc/engine";
import {
  MTF_CONFIG,
  evaluateMtf,
  findSweep,
  mirror,
  pickZone,
  trend4h,
  type MtfEntryType,
  type MtfResult,
} from "../services/mtf-strategy/engine";
import type { Candle } from "../types/index";
import type { BacktestTrade } from "./fq-backtest";

/**
 * SMC MTF backtest — har yopilgan 5m sham uchun live'dagi `evaluateMtf` aynan shu oynalar
 * (4H/1H/5m oxirgi 300 ta yopilgan sham) bilan chaqiriladi. Tezlik uchun oldindan saralash:
 * 4H trend bor, shu 1H da zona + sweep faol va shu 5m shamda trend tomonga BOS bo'lsa — faqat
 * shunda to'liq baholash (live ham signalni aynan BOS shami yopilgan siklda beradi).
 *
 * Keyin live kabi: limit 12 ta 5m sham ichida to'lmasa yoki narx avval TP1 ga yetsa — bekor;
 * to'lsa TP1 (50%, BE) / TP2 / SL 5m shamlarda, ko'pi bilan `SIGNAL_MAX_BARS` sham.
 * Bitta sweep — bitta signal; coin pending/ochiq paytida yangi signal yo'q.
 */
const WINDOW = 300;
const MAX_WAIT = 12;

export interface MtfTrade extends BacktestTrade {
  confidence: NonNullable<MtfResult["confidence"]>;
  entryType: MtfEntryType;
  plannedRR: number;
  confluence: boolean;
}

export interface MtfBacktestResult {
  trades: MtfTrade[];
  setups: number;
  cancelled: number;
}

export interface MtfCosts {
  maker: number;
  taker: number;
}

export function backtestMtf(
  symbol: string,
  c4h: Candle[],
  c1h: Candle[],
  c5m: Candle[],
  costs: MtfCosts = { maker: 0.0002, taker: 0.0007 },
): MtfBacktestResult {
  const struct5 = computeStructure(c5m, calculateATRSeries(c5m, 14), MTF_CONFIG.structure5m);
  const trades: MtfTrade[] = [];
  const usedSweeps = new Set<string>();
  let setups = 0;
  let cancelled = 0;

  let h = -1;
  let k = -1;
  let trendAt = -1;
  let side: "long" | "short" | null = null;
  let sweepAt = -1;
  let sweepActive = false;
  let busyUntil = -Infinity;

  for (let t = WINDOW; t < c5m.length - 1; t++) {
    const now = c5m[t]!.closeTime;
    while (h + 1 < c4h.length && c4h[h + 1]!.closeTime <= now) h++;
    while (k + 1 < c1h.length && c1h[k + 1]!.closeTime <= now) k++;
    if (now <= busyUntil || h < WINDOW - 1 || k < WINDOW - 1) continue;

    if (h !== trendAt) {
      trendAt = h;
      side = trend4h(c4h.slice(h - WINDOW + 1, h + 1)).side;
      sweepAt = -1;
    }
    if (!side) continue;
    if (!(side === "long" ? struct5[t]!.bosUp : struct5[t]!.bosDown)) continue;

    const w1h = c1h.slice(k - WINDOW + 1, k + 1);
    if (k !== sweepAt) {
      sweepAt = k;
      const m = side === "long" ? w1h : mirror(w1h);
      const pick = pickZone(m, calculateATRSeries(m, 14));
      sweepActive = pick?.state === "active" && findSweep(m, pick.zone.firstTouch!) !== null;
    }
    if (!sweepActive) continue;

    const r = evaluateMtf({
      symbol,
      c4h: c4h.slice(h - WINDOW + 1, h + 1),
      c1h: w1h,
      c5m: c5m.slice(t - WINDOW + 1, t + 1),
      // Tarixiy funding olinmaydi — 0 (ogohlantirishsiz) deb hisoblanadi.
      fundingRate: 0,
      newsWithin30min: false,
      tradesToday: 0,
      consecutiveLosses: 0,
    });
    if (r.decision !== "LONG" && r.decision !== "SHORT") continue;
    const key = `${r.decision}:${r.sweep!.time}`;
    if (usedSweeps.has(key)) continue;
    usedSweeps.add(key);
    setups += 1;

    const levels = {
      side: r.decision === "LONG" ? ("long" as const) : ("short" as const),
      entry: r.entry!,
      stopLoss: r.stop_loss!,
      tp1: r.tp1!,
      tp2: r.tp2!,
    };
    const res = resolvePending({ ...levels, invalidate: levels.tp1 }, c5m.slice(t + 1, t + 1 + MAX_WAIT), MAX_WAIT);
    if (res.state === "pending") break; // tarix tugadi
    if (res.state === "cancelled") {
      cancelled += 1;
      busyUntil = res.at;
      continue;
    }

    const fill = t + 1 + res.index;
    const risk = Math.abs(levels.entry - levels.stopLoss);
    const entryFee = r.entry_type === "MARKET" ? costs.taker : costs.maker;
    const costR = ((entryFee + costs.taker) * levels.entry) / risk;
    const base = {
      symbol,
      side: levels.side,
      setup: "sweep" as const,
      signalTime: c5m[t]!.openTime,
      costR,
      confluences: [r.zone_1h.confluence ? "OB+FVG" : r.zone_1h.type!, r.entry_type!],
      confidence: r.confidence!,
      entryType: r.entry_type!,
      plannedRR: r.rr!,
      confluence: r.zone_1h.confluence,
    };
    if (res.stoppedOnFill) {
      trades.push({ ...base, closedAt: c5m[fill]!.closeTime, status: "sl", grossR: -1, netR: -1 - costR });
      busyUntil = c5m[fill]!.closeTime;
      continue;
    }
    const outcome = evaluateSignalOutcome(levels, c5m.slice(fill + 1, fill + 1 + SIGNAL_MAX_BARS));
    if (outcome.resultR === null || outcome.closedAt === null) break;
    trades.push({ ...base, closedAt: outcome.closedAt, status: outcome.status, grossR: outcome.resultR, netR: outcome.resultR - costR });
    busyUntil = outcome.closedAt;
  }

  return { trades, setups, cancelled };
}

/**
 * Portfel intizomi (live kabi, barcha coinlar bo'yicha): UTC kuniga ≤ 3 ta savdo; shu kuni
 * ketma-ket 2 ta zarar bo'lsa — kun oxirigacha savdo yo'q.
 */
export function applyDiscipline<T extends BacktestTrade>(trades: T[]): T[] {
  const accepted: T[] = [];
  const dayKey = (ms: number) => Math.floor(ms / 86_400_000);
  for (const tr of [...trades].sort((a, b) => a.signalTime - b.signalTime)) {
    const day = dayKey(tr.signalTime);
    const today = accepted.filter((a) => dayKey(a.signalTime) === day);
    if (today.length >= MTF_CONFIG.maxTradesPerDay) continue;
    const closed = today.filter((a) => a.closedAt <= tr.signalTime).sort((a, b) => b.closedAt - a.closedAt);
    let losses = 0;
    for (const a of closed) {
      if (a.netR < 0) losses += 1;
      else break;
    }
    if (losses >= MTF_CONFIG.maxConsecutiveLosses) continue;
    accepted.push(tr);
  }
  return accepted;
}
