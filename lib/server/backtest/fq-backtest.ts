import { calculateEMA } from "../services/indicators.service";
import {
  FQ_SWING_CONFIG,
  computeFqLevels,
  computeFqSeries,
  evaluateFqBar,
  type FqConfig,
  type FqHtfBias,
} from "../services/fq-strategy/engine";
import { evaluateSignalOutcome, SIGNAL_MAX_BARS } from "../services/fq-strategy/outcome";
import { DAY_CONFIG, computeSupertrend, evaluateDayOutcome } from "../services/day-strategy/engine";
import type { Candle, MarketType, SignalStatus } from "../types/index";

/**
 * FQ v3 ni tarixiy shamlarda live sikl bilan bir xil qoidalarda o'ynatadi:
 * - signal faqat yopilgan 1H shamda, kirish o'sha sham close'ida;
 * - HTF (4H EMA200) bias — shu 1H sham yopilgan paytgacha yopilgan oxirgi 4H shamdan;
 * - bitta coinda bitta ochiq savdo (pyramiding = 0);
 * - chiqish `evaluateSignalOutcome` (TP1 50% + BE, TP2, SL, 168 sham expiry);
 * - xarajat (komissiya + slippage) R da ayiriladi.
 */
export interface BacktestOptions {
  config?: FqConfig;
  marketType?: MarketType;
  /** Bir tomonga komissiya + slippage, ulush (0.0007 = 0.07%) — taker / market order. */
  costPerSide?: number;
  /** Limit (maker) kirish xarajati — slippage yo'q. */
  makerCost?: number;
  /**
   * "market" — signal shami close'ida (live hozir shunday).
   * "limit" — close va stop orasida `limitFrac` chuqurlikda limit order, `limitBars` sham kutiladi;
   * to'lmasa yoki narx avval TP1 ga yetsa — bekor.
   */
  entryMode?: "market" | "limit";
  limitFrac?: number;
  limitBars?: number;
  htfEmaLen?: number;
  /** Indikatorlar isishi uchun o'tkazib yuboriladigan shamlar. */
  warmupBars?: number;
}

export interface BacktestTrade {
  symbol: string;
  side: "long" | "short";
  setup: "pullback" | "breakout" | "sweep";
  signalTime: number;
  closedAt: number;
  status: SignalStatus;
  grossR: number;
  costR: number;
  netR: number;
  confluences: string[];
}

function htfBiasSeries(htf: Candle[], emaLen: number): { closeTime: number; bias: FqHtfBias }[] {
  const ema = calculateEMA(
    htf.map((c) => c.close),
    emaLen,
  );
  return htf.map((c, i) => {
    const e = ema[i]!;
    const bias: FqHtfBias =
      i < emaLen - 1 || !Number.isFinite(e) ? null : c.close > e ? "bullish" : c.close < e ? "bearish" : null;
    return { closeTime: c.closeTime, bias };
  });
}

export function backtestFq(symbol: string, candles: Candle[], htf: Candle[], options: BacktestOptions = {}): BacktestTrade[] {
  const config = options.config ?? FQ_SWING_CONFIG;
  const marketType = options.marketType ?? "futures";
  const costPerSide = options.costPerSide ?? 0.0007;
  const makerCost = options.makerCost ?? 0.0002;
  const entryMode = options.entryMode ?? "market";
  const limitFrac = options.limitFrac ?? 0.5;
  const limitBars = options.limitBars ?? 3;
  const warmup = options.warmupBars ?? 250;

  const series = computeFqSeries(candles, config);
  const biases = htfBiasSeries(htf, options.htfEmaLen ?? 200);
  const trades: BacktestTrade[] = [];

  let h = -1;
  let busyUntil = -Infinity;

  for (let t = warmup; t < candles.length - 1; t++) {
    const bar = candles[t]!;
    while (h + 1 < biases.length && biases[h + 1]!.closeTime <= bar.closeTime) h++;
    if (bar.closeTime <= busyUntil) continue;

    const bias = h >= 0 ? biases[h]!.bias : null;
    const state = evaluateFqBar(series, t, bias, config);
    if (!state) continue;
    const side = state.longSig ? "long" : state.shortSig && marketType === "futures" ? "short" : null;
    if (!side) continue;

    let levels = computeFqLevels(state, side, config);
    if (!levels.riskOk) continue;
    const long = side === "long";
    const d = long ? 1 : -1;

    let from = t + 1;
    let entryCost = costPerSide;
    if (entryMode === "limit") {
      const price = levels.entry - d * limitFrac * levels.risk;
      let filled = -1;
      for (let j = t + 1; j <= Math.min(candles.length - 1, t + limitBars); j++) {
        const c = candles[j]!;
        if (long ? c.low <= price : c.high >= price) {
          filled = j;
          break;
        }
        if (long ? c.high >= levels.tp1 : c.low <= levels.tp1) break; // narx ketib qoldi
      }
      if (filled < 0) {
        busyUntil = candles[Math.min(candles.length - 1, t + limitBars)]!.closeTime;
        continue;
      }
      const risk = Math.abs(price - levels.stopLoss);
      levels = {
        ...levels,
        entry: price,
        risk,
        tp1: price + d * risk * config.tp1R,
        tp2: config.exitMode && config.exitMode !== "fixed" ? levels.tp2 : price + d * risk * config.tp2R,
      };
      entryCost = makerCost;
      // To'lgan shamda TP hisoblanmaydi (u to'lishdan oldin bo'lgan bo'lishi mumkin), stop esa hisoblanadi.
      const fillBar = candles[filled]!;
      if (long ? fillBar.low <= levels.stopLoss : fillBar.high >= levels.stopLoss) {
        const costR = ((entryCost + costPerSide) * levels.entry) / levels.risk;
        trades.push({
          symbol,
          side,
          setup: (long ? state.boLong : state.boShort) ? "breakout" : "pullback",
          signalTime: bar.openTime,
          closedAt: fillBar.closeTime,
          status: "sl",
          grossR: -1,
          costR,
          netR: -1 - costR,
          confluences: long ? state.confluencesLong : state.confluencesShort,
        });
        busyUntil = fillBar.closeTime;
        continue;
      }
      from = filled + 1;
    }

    const outcome = evaluateSignalOutcome(levels, candles.slice(from, from + SIGNAL_MAX_BARS), config);
    if (outcome.resultR === null || outcome.closedAt === null) break; // ma'lumot tugadi — savdo hali ochiq

    const costR = ((entryCost + costPerSide) * levels.entry) / levels.risk;
    trades.push({
      symbol,
      side,
      setup: (long ? state.boLong : state.boShort) ? "breakout" : (long ? state.swLong : state.swShort) && !(long ? state.pbLong : state.pbShort) ? "sweep" : "pullback",
      signalTime: bar.openTime,
      closedAt: outcome.closedAt,
      status: outcome.status,
      grossR: outcome.resultR,
      costR,
      netR: outcome.resultR - costR,
      confluences: long ? state.confluencesLong : state.confluencesShort,
    });
    busyUntil = outcome.closedAt;
  }

  return trades;
}

export interface BacktestStats {
  trades: number;
  winRate: number;
  avgR: number;
  totalR: number;
  profitFactor: number;
  maxDrawdownR: number;
  /** Xarajatsiz o'rtacha R va o'rtacha xarajat (R) — edge xarajatga yeyilyaptimi. */
  avgGrossR: number;
  avgCostR: number;
}

export function summarize(trades: BacktestTrade[]): BacktestStats {
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  let gains = 0;
  let losses = 0;
  let wins = 0;
  for (const tr of sorted) {
    equity += tr.netR;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
    if (tr.netR > 0) {
      gains += tr.netR;
      wins += 1;
    } else losses -= tr.netR;
  }
  const n = sorted.length;
  return {
    trades: n,
    winRate: n ? (wins / n) * 100 : 0,
    avgR: n ? equity / n : 0,
    totalR: equity,
    profitFactor: losses > 0 ? gains / losses : gains > 0 ? Infinity : 0,
    maxDrawdownR: maxDd,
    avgGrossR: n ? sorted.reduce((sum, tr) => sum + tr.grossR, 0) / n : 0,
    avgCostR: n ? sorted.reduce((sum, tr) => sum + tr.costR, 0) / n : 0,
  };
}

/**
 * Day trade (Supertrend 15M + 1H EMA 50/200) — live `buildDayFromCandles` + `evaluateDayOutcome`
 * bilan bir xil: flip 1H trend tomonga bo'lgan sham close'ida kirish, stop Supertrend chizig'ida.
 */
export function backtestDay(
  symbol: string,
  candles: Candle[],
  htf: Candle[],
  options: Pick<BacktestOptions, "costPerSide" | "marketType" | "warmupBars"> = {},
): BacktestTrade[] {
  const costPerSide = options.costPerSide ?? 0.0007;
  const marketType = options.marketType ?? "futures";
  const warmup = options.warmupBars ?? 300;
  const { dir, line } = computeSupertrend(candles);
  const closes = htf.map((c) => c.close);
  const slow = calculateEMA(closes, DAY_CONFIG.htfSlowLen);
  const fast = calculateEMA(closes, DAY_CONFIG.htfFastLen);
  const trades: BacktestTrade[] = [];
  let h = -1;
  let busyUntil = -Infinity;

  for (let t = warmup; t < candles.length - 1; t++) {
    const bar = candles[t]!;
    while (h + 1 < htf.length && htf[h + 1]!.closeTime <= bar.closeTime) h++;
    if (bar.closeTime <= busyUntil || h < DAY_CONFIG.htfSlowLen - 1) continue;
    const c = closes[h]!;
    const bias = c > slow[h]! && fast[h]! > slow[h]! ? 1 : c < slow[h]! && fast[h]! < slow[h]! ? -1 : 0;
    if (!bias || (bias === -1 && marketType !== "futures")) continue;
    if (dir[t] !== bias || dir[t - 1] !== -bias) continue;

    const entry = bar.close;
    const stopLoss = line[t]!;
    const risk = Math.abs(entry - stopLoss);
    if (!(risk > 0)) continue;
    const side = bias === 1 ? "long" : "short";
    const outcome = evaluateDayOutcome(
      { side, entry, stopLoss, signalTime: bar.openTime },
      candles.slice(Math.max(0, t - warmup), t + DAY_CONFIG.maxBars + 1),
    );
    if (outcome.resultR === null || outcome.closedAt === null) break;
    const costR = (2 * costPerSide * entry) / risk;
    trades.push({
      symbol,
      side,
      setup: "breakout",
      signalTime: bar.openTime,
      closedAt: outcome.closedAt,
      status: outcome.status,
      grossR: outcome.resultR,
      costR,
      netR: outcome.resultR - costR,
      confluences: [],
    });
    busyUntil = outcome.closedAt;
  }
  return trades;
}
