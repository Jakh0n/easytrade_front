/**
 * 5.2 Pre-Pump / Pre-Dump scanner (early warning). On 15m, 4 conditions:
 *   a) Squeeze — BB bandwidth in the lowest 10% of the last 100 bars (recently)
 *   b) Volume  — last 3 bars average > 2.5× the 20-bar average before them
 *   c) OI      — +8% over 4h while price stayed within ±2%
 *   d) BTC     — BTC has not moved > 1.5% against the bias in the last 1h
 * ≥ 3 of 4 → WATCH (no entry). Bias: negative funding / rising CVD → long; positive / falling → short.
 *
 * WATCH → ENTRY: a later 15m close beyond the watched range with volume > 2× average.
 * Stateless: the WATCH state at earlier bars is re-derived from data, so live and backtest
 * produce the same upgrade without depending on what was stored in the DB.
 */
import { STRATEGY_LABELS } from "../config";
import { last, oiAt, pctChange, percentileOfLast, sma } from "../indicators";
import type { Direction, Signal, Strategy, StrategyInput } from "../types";
import { buildEntry, hoursMs, round, sign } from "./helpers";

const BAR_MS = 15 * 60_000;

export interface WatchState {
  conditions: number;
  ok: boolean;
  bias: Direction;
  squeeze: boolean;
  volume: boolean;
  oi: boolean;
  btc: boolean;
  volRatio: number;
  oiChangePct: number;
  priceChangePct: number;
  btcChangePct: number;
  bbPercentile: number;
  rangeHigh: number;
  rangeLow: number;
}

/** Evaluates the 4 WATCH conditions using only 15m bars up to and including index `j`. */
export function watchStateAt(input: StrategyInput, j: number): WatchState | null {
  const { data, ind, cfg } = input;
  const p = cfg.strategies.pre_pump;
  const c = data.c15m;
  const barsFor4h = Math.round(hoursMs(p.oiWindowHours) / BAR_MS);
  if (j < Math.max(p.bbRankWindow, p.volAvgPeriod + p.volBars, barsFor4h, p.rangeBars) || j >= c.length) return null;

  // a) squeeze
  let bbPercentile = Infinity;
  for (let i = j - p.squeezeRecentBars + 1; i <= j; i++) {
    bbPercentile = Math.min(bbPercentile, percentileOfLast(ind.m15.bbWidth, p.bbRankWindow, i + 1));
  }
  const squeeze = bbPercentile <= p.bbSqueezePct;

  // b) volume
  const vols = c.map((x) => x.volume);
  let recent = 0;
  for (let i = j - p.volBars + 1; i <= j; i++) recent += vols[i]!;
  recent /= p.volBars;
  const avg = sma(vols, p.volAvgPeriod, j - p.volBars + 1);
  const volRatio = avg > 0 ? recent / avg : NaN;
  const volume = volRatio > p.volMult;

  // c) OI up while price flat
  const tEnd = c[j]!.closeTime;
  const oiChangePct = pctChange(oiAt(data.oi, tEnd - hoursMs(p.oiWindowHours)), oiAt(data.oi, tEnd));
  const priceChangePct = pctChange(c[j - barsFor4h]!.close, c[j]!.close);
  const oi = oiChangePct >= p.oiRisePct && Math.abs(priceChangePct) <= p.flatPricePct;

  // Bias: funding sign + CVD slope over the range; tie → side of VWAP.
  const cvdSlope = ind.m15.cvd[j]! - ind.m15.cvd[j - p.rangeBars]!;
  const f = data.funding;
  const score = (f !== null && f < 0 ? 1 : f !== null && f > 0 ? -1 : 0) + (cvdSlope > 0 ? 1 : cvdSlope < 0 ? -1 : 0);
  const bias: Direction = score > 0 ? "long" : score < 0 ? "short" : c[j]!.close >= ind.m15.vwap[j]! ? "long" : "short";

  // d) BTC not moving hard against the bias
  const btcBars = data.btc1h.filter((b) => b.closeTime <= tEnd);
  const b1 = btcBars.at(-1);
  const b0 = btcBars.at(-2);
  const btcChangePct = b1 && b0 ? pctChange(b0.close, b1.close) : NaN;
  const btc = Number.isFinite(btcChangePct) && sign(bias) * btcChangePct > -p.btcMaxAdverse1hPct;

  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (let i = j - p.rangeBars + 1; i <= j; i++) {
    rangeHigh = Math.max(rangeHigh, c[i]!.high);
    rangeLow = Math.min(rangeLow, c[i]!.low);
  }

  const conditions = [squeeze, volume, oi, btc].filter(Boolean).length;
  return {
    conditions,
    ok: conditions >= p.minConditions,
    bias,
    squeeze,
    volume,
    oi,
    btc,
    volRatio,
    oiChangePct,
    priceChangePct,
    btcChangePct,
    bbPercentile,
    rangeHigh,
    rangeLow,
  };
}

function stateFactors(w: WatchState) {
  return {
    pp_conditions: w.conditions,
    pp_squeeze: w.squeeze,
    pp_bb_pct: round(w.bbPercentile, 2),
    pp_vol_ratio: round(w.volRatio, 2),
    pp_oi_chg_pct: round(w.oiChangePct, 2),
    pp_price_chg_pct: round(w.priceChangePct, 2),
    pp_btc_chg_pct: round(w.btcChangePct, 2),
  };
}

function stateReasons(w: WatchState): string[] {
  const out: string[] = [];
  if (w.squeeze) out.push("BB squeeze");
  if (w.volume) out.push(`Volume ${w.volRatio.toFixed(1)}x`);
  if (w.oi) out.push(`OI ${w.oiChangePct >= 0 ? "+" : ""}${w.oiChangePct.toFixed(0)}% / 4h while price flat`);
  return out;
}

function evaluate(symbol: string, input: StrategyInput): Signal | null {
  const { data, ind, cfg } = input;
  const p = cfg.strategies.pre_pump;
  const c = data.c15m;
  const n = c.length;
  if (n < 2) return null;
  const cur = c[n - 1]!;
  const prev = c[n - 2]!;
  const atr15 = last(ind.m15.atr);

  // ── Upgrade: breakout of a range that was on WATCH within the last `watchValidBars`.
  const avgVol = sma(c.map((x) => x.volume), p.volAvgPeriod, n - 1);
  const breakoutVol = avgVol > 0 && cur.volume > p.breakoutVolMult * avgVol;
  if (breakoutVol) {
    for (let j = n - 2; j >= Math.max(0, n - 1 - p.watchValidBars); j--) {
      const w = watchStateAt(input, j);
      if (!w?.ok) continue;
      const s = sign(w.bias);
      const edge = s === 1 ? w.rangeHigh : w.rangeLow;
      const broke = s * (cur.close - edge) > 0 && s * (prev.close - edge) <= 0;
      if (!broke) break; // most recent WATCH decides; an older one would be stale
      const height = w.rangeHigh - w.rangeLow;
      const rangeMid = (w.rangeHigh + w.rangeLow) / 2;
      const zone: [number, number] = s === 1 ? [edge, cur.close] : [cur.close, edge];
      const mid = (zone[0] + zone[1]) / 2;
      return buildEntry({
        input,
        strategy: "pre_pump",
        direction: w.bias,
        zone,
        stopLoss: rangeMid - s * p.slAtr * atr15,
        tp1: mid + s * p.tp1RangeMult * height,
        tp2: mid + s * p.tp2RangeMult * height,
        confidence: p.baseConfidence + (w.conditions - p.minConditions) * 5,
        invalidation: {
          timeframe: "15m",
          level: rangeMid,
          description: "15m close back below range midpoint",
        },
        reasons: [
          `Breakout of ${STRATEGY_LABELS.pre_pump} range, volume ${(cur.volume / avgVol).toFixed(1)}x`,
          ...stateReasons(w),
        ],
        factors: { ...stateFactors(w), pp_upgrade: true, pp_breakout_vol: round(cur.volume / avgVol, 2) },
      });
    }
  }

  // ── WATCH on the current bar.
  const w = watchStateAt(input, n - 1);
  if (!w?.ok) return null;
  const reasons = stateReasons(w);
  return {
    symbol,
    direction: w.bias,
    strategy: "pre_pump",
    kind: "watch",
    entryZoneLow: w.rangeLow,
    entryZoneHigh: w.rangeHigh,
    stopLoss: null,
    tp1: null,
    tp2: null,
    confidence: p.watchConfidence + (w.conditions - p.minConditions) * 10,
    triggerTime: cur.closeTime,
    expiresAt: cur.closeTime + p.watchValidBars * BAR_MS,
    invalidation: null,
    reasons: reasons.length ? reasons : ["Pre-pump conditions"],
    factors: { ...stateFactors(w), pp_upgrade: false },
  };
}

export const prePump: Strategy = { name: "pre_pump", evaluate };
