import type { Candle } from "../types/index";

/**
 * Streaming (O(n)) indicator series.
 *
 * `indicators.service.ts` exposes scalar helpers that recompute from the whole
 * input on every call. That is fine for a single analyze request but turns a
 * backtest into O(n²) — the reason the old engine was capped at 1000 candles.
 * These functions walk the input once and return a value per bar, aligned with
 * the input array, using NaN for bars before the indicator is seeded.
 */

function assertPositivePeriod(period: number, label: string): void {
  if (!Number.isFinite(period) || period <= 0) {
    throw new Error(`${label} musbat son bo'lishi kerak`);
  }
}

function filledSeries(length: number): number[] {
  return new Array<number>(length).fill(NaN);
}

/** Wilder-smoothed RSI, one value per close. */
export function calculateRSISeries(
  closes: number[],
  period: number = 14,
): number[] {
  assertPositivePeriod(period, "period");
  const rsi = filledSeries(closes.length);

  if (closes.length < period + 1) {
    return rsi;
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return rsi;
}

function trueRange(current: Candle, previousClose: number): number {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previousClose),
    Math.abs(current.low - previousClose),
  );
}

/** Wilder-smoothed ATR, one value per candle. */
export function calculateATRSeries(
  candles: Candle[],
  period: number = 14,
): number[] {
  assertPositivePeriod(period, "period");
  const atr = filledSeries(candles.length);

  if (candles.length < period + 1) {
    return atr;
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += trueRange(candles[i]!, candles[i - 1]!.close);
  }

  let value = sum / period;
  atr[period] = value;

  for (let i = period + 1; i < candles.length; i++) {
    const tr = trueRange(candles[i]!, candles[i - 1]!.close);
    value = (value * (period - 1) + tr) / period;
    atr[i] = value;
  }

  return atr;
}

/**
 * Wilder ADX with its directional components. ADX measures trend *strength*
 * regardless of direction, which is what separates a trending market (where
 * pullback continuation works) from a range (where it gets chopped up).
 */
export interface AdxSeries {
  adx: number[];
  plusDi: number[];
  minusDi: number[];
}

export function calculateADXSeries(
  candles: Candle[],
  period: number = 14,
): AdxSeries {
  assertPositivePeriod(period, "period");
  const length = candles.length;
  const adx = filledSeries(length);
  const plusDi = filledSeries(length);
  const minusDi = filledSeries(length);

  // DI is seeded at index `period`, and ADX averages `period` DX values on top
  // of that, so the first usable ADX lands at index 2 * period - 1.
  if (length < period * 2) {
    return { adx, plusDi, minusDi };
  }

  const plusDm: number[] = [0];
  const minusDm: number[] = [0];
  const tr: number[] = [0];

  for (let i = 1; i < length; i++) {
    const current = candles[i]!;
    const previous = candles[i - 1]!;
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(trueRange(current, previous.close));
  }

  let smoothedTr = 0;
  let smoothedPlus = 0;
  let smoothedMinus = 0;

  for (let i = 1; i <= period; i++) {
    smoothedTr += tr[i]!;
    smoothedPlus += plusDm[i]!;
    smoothedMinus += minusDm[i]!;
  }

  const dxValues: number[] = [];

  const pushDi = (index: number): number => {
    const plus = smoothedTr === 0 ? 0 : (smoothedPlus / smoothedTr) * 100;
    const minus = smoothedTr === 0 ? 0 : (smoothedMinus / smoothedTr) * 100;
    plusDi[index] = plus;
    minusDi[index] = minus;
    const sum = plus + minus;
    return sum === 0 ? 0 : (Math.abs(plus - minus) / sum) * 100;
  };

  dxValues.push(pushDi(period));

  for (let i = period + 1; i < length; i++) {
    smoothedTr = smoothedTr - smoothedTr / period + tr[i]!;
    smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm[i]!;
    smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm[i]!;

    const dx = pushDi(i);
    dxValues.push(dx);

    if (dxValues.length === period) {
      adx[i] = dxValues.reduce((total, value) => total + value, 0) / period;
    } else if (dxValues.length > period) {
      adx[i] = (adx[i - 1]! * (period - 1) + dx) / period;
    }
  }

  return { adx, plusDi, minusDi };
}

/**
 * Where `value` sits inside `window`, as a 0–100 percentile. Used to judge
 * volatility relative to the asset's own recent behaviour instead of against a
 * hardcoded threshold that means different things for BTC and a small altcoin.
 */
export function percentileRank(window: number[], value: number): number {
  const valid = window.filter((item) => Number.isFinite(item));

  if (valid.length === 0 || !Number.isFinite(value)) {
    return NaN;
  }

  const below = valid.filter((item) => item <= value).length;
  return (below / valid.length) * 100;
}

/** Normalised EMA slope over `lookback` bars, expressed in ATR units. */
export function emaSlopeInAtr(
  ema: number[],
  index: number,
  atr: number,
  lookback: number = 20,
): number {
  const current = ema[index];
  const past = ema[index - lookback];

  if (
    current === undefined ||
    past === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(past) ||
    !Number.isFinite(atr) ||
    atr <= 0
  ) {
    return NaN;
  }

  return (current - past) / atr;
}
