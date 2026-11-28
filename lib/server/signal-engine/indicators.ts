/**
 * Indicators shared by all strategies, computed once per symbol per cycle.
 * Series are aligned with their candle arrays (NaN before warm-up).
 * Higher-timeframe blocks are memoised by (symbol, tf, last candle) — in a backtest the
 * 4H block is reused for 16 consecutive 15m steps, in live across warm invocations.
 */
import { calculateEMA } from "../services/indicators.service";
import { calculateADXSeries, calculateATRSeries, calculateRSISeries } from "../services/indicators.series";
import type { Candle } from "../types/index";
import type { EngineConfig } from "./config";
import type { MarketData } from "./types";

export interface SwingPoint {
  index: number;
  price: number;
}

export interface H4Block {
  emaFast: number[];
  emaSlow: number[];
  adx: number[];
  atr: number[];
  /** SMA of ATR over `regime.atrAvgPeriod`, at the last bar. */
  atrAvg: number;
}

export interface H1Block {
  emaBandFast: number[];
  emaBandSlow: number[];
  atr: number[];
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
}

export interface M15Block {
  atr: number[];
  rsi: number[];
  /** Bollinger bandwidth = (upper − lower) / middle. */
  bbWidth: number[];
  /** Cumulative volume delta from taker buy volume: Σ(2·takerBuy − volume). */
  cvd: number[];
  /** UTC-session VWAP (resets at 00:00 UTC). */
  vwap: number[];
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
}

export interface Indicators {
  h4: H4Block;
  h1: H1Block;
  m15: M15Block;
}

// ───────────── primitives ─────────────

export function sma(values: number[], period: number, end: number = values.length): number {
  if (end < period) return NaN;
  let sum = 0;
  for (let i = end - period; i < end; i++) sum += values[i]!;
  return sum / period;
}

export function last(values: number[]): number {
  return values[values.length - 1] ?? NaN;
}

/** Confirmed pivots only: bar i needs `pivot` closed bars on both sides (no look-ahead). */
export function findSwings(candles: Candle[], pivot: number): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  for (let i = pivot; i < candles.length - pivot; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let k = 1; k <= pivot && (isHigh || isLow); k++) {
      const l = candles[i - k]!;
      const r = candles[i + k]!;
      if (l.high >= c.high || r.high > c.high) isHigh = false;
      if (l.low <= c.low || r.low < c.low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, price: c.high });
    if (isLow) lows.push({ index: i, price: c.low });
  }
  return { highs, lows };
}

export function bollingerWidth(closes: number[], period: number, std: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let k = i - period + 1; k <= i; k++) sum += closes[k]!;
    const mean = sum / period;
    let sq = 0;
    for (let k = i - period + 1; k <= i; k++) sq += (closes[k]! - mean) ** 2;
    const sd = Math.sqrt(sq / period);
    out[i] = mean > 0 ? (2 * std * sd) / mean : NaN;
  }
  return out;
}

export function cvdSeries(candles: Candle[]): number[] {
  let acc = 0;
  return candles.map((c) => {
    // Old cache rows may lack taker volume — treat as neutral.
    const buy = c.takerBuyVolume ?? c.volume / 2;
    acc += 2 * buy - c.volume;
    return acc;
  });
}

export function sessionVwap(candles: Candle[]): number[] {
  let day = -1;
  let pv = 0;
  let vol = 0;
  return candles.map((c) => {
    const d = Math.floor(c.openTime / 86_400_000);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    return vol > 0 ? pv / vol : typical;
  });
}

/** Percentile (0–100) of the last value within the trailing `window` values ending at `end` (exclusive). */
export function percentileOfLast(values: number[], window: number, end: number = values.length): number {
  const from = Math.max(0, end - window);
  const v = values[end - 1];
  if (v === undefined || !Number.isFinite(v)) return NaN;
  let n = 0;
  let below = 0;
  for (let i = from; i < end; i++) {
    const x = values[i]!;
    if (!Number.isFinite(x)) continue;
    n += 1;
    if (x <= v) below += 1;
  }
  return n ? (below / n) * 100 : NaN;
}

export function pctChange(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : NaN;
}

/** Last OI value at or before `time` (series is ascending). */
export function oiAt(oi: { time: number; oi: number }[], time: number): number {
  let lo = 0;
  let hi = oi.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (oi[mid]!.time <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? oi[ans]!.oi : NaN;
}

// ───────────── blocks (memoised) ─────────────

const MEMO_LIMIT = 2_000;
const memo = new Map<string, unknown>();

function memoised<T>(key: string, compute: () => T): T {
  const hit = memo.get(key);
  if (hit !== undefined) return hit as T;
  const value = compute();
  if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value!);
  memo.set(key, value);
  return value;
}

function blockKey(symbol: string, tf: string, candles: Candle[]): string {
  return `${symbol}:${tf}:${candles.length}:${candles.at(-1)?.openTime ?? 0}`;
}

function safeEma(closes: number[], period: number): number[] {
  return closes.length ? calculateEMA(closes, period) : [];
}

export function computeH4(symbol: string, c4h: Candle[], cfg: EngineConfig): H4Block {
  return memoised(blockKey(symbol, "4h", c4h), () => {
    const closes = c4h.map((c) => c.close);
    const atr = calculateATRSeries(c4h, cfg.regime.atrPeriod);
    const validAtr = atr.filter(Number.isFinite);
    return {
      emaFast: safeEma(closes, cfg.regime.emaFast),
      emaSlow: safeEma(closes, cfg.regime.emaSlow),
      adx: calculateADXSeries(c4h, cfg.regime.adxPeriod).adx,
      atr,
      atrAvg: sma(validAtr, cfg.regime.atrAvgPeriod),
    };
  });
}

export function computeH1(symbol: string, c1h: Candle[], cfg: EngineConfig): H1Block {
  return memoised(blockKey(symbol, "1h", c1h), () => {
    const closes = c1h.map((c) => c.close);
    const s = cfg.strategies.trend_pullback;
    const swings = findSwings(c1h, s.swingPivot1h);
    return {
      emaBandFast: safeEma(closes, s.emaBandFast),
      emaBandSlow: safeEma(closes, s.emaBandSlow),
      atr: calculateATRSeries(c1h, 14),
      swingHighs: swings.highs,
      swingLows: swings.lows,
    };
  });
}

export function computeM15(symbol: string, c15m: Candle[], cfg: EngineConfig): M15Block {
  return memoised(blockKey(symbol, "15m", c15m), () => {
    const closes = c15m.map((c) => c.close);
    const p = cfg.strategies.pre_pump;
    const swings = findSwings(c15m, cfg.strategies.trend_pullback.swingPivot15m);
    return {
      atr: calculateATRSeries(c15m, 14),
      rsi: calculateRSISeries(closes, cfg.factors.rsiPeriod),
      bbWidth: bollingerWidth(closes, p.bbPeriod, p.bbStd),
      cvd: cvdSeries(c15m),
      vwap: sessionVwap(c15m),
      swingHighs: swings.highs,
      swingLows: swings.lows,
    };
  });
}

export function computeIndicators(data: MarketData, cfg: EngineConfig): Indicators {
  return {
    h4: computeH4(data.symbol, data.c4h, cfg),
    h1: computeH1(data.symbol, data.c1h, cfg),
    m15: computeM15(data.symbol, data.c15m, cfg),
  };
}

/** Clears the memo (tests). */
export function resetIndicatorMemo(): void {
  memo.clear();
}
