import type { Candle, SupportResistance, VolumeStatus } from "../types/index";

export interface SwingPoint {
  index: number;
  price: number;
}

function assertPositivePeriod(period: number, label: string): void {
  if (!Number.isFinite(period) || period <= 0) {
    throw new Error(`${label} musbat son bo'lishi kerak`);
  }
}

function assertNonEmptyCloses(closes: number[]): void {
  if (closes.length === 0) {
    throw new Error("closes massivi bo'sh bo'lmasligi kerak");
  }
}

function assertNonEmptyCandles(candles: Candle[]): void {
  if (candles.length === 0) {
    throw new Error("candles massivi bo'sh bo'lmasligi kerak");
  }
}

export function calculateEMA(closes: number[], period: number): number[] {
  assertNonEmptyCloses(closes);
  assertPositivePeriod(period, "period");

  if (closes.length < period) {
    return closes.map(() => NaN);
  }

  const multiplier = 2 / (period + 1);
  const ema = new Array<number>(closes.length).fill(NaN);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i]!;
  }

  let prevEma = sum / period;
  ema[period - 1] = prevEma;

  for (let i = period; i < closes.length; i++) {
    prevEma = (closes[i]! - prevEma) * multiplier + prevEma;
    ema[i] = prevEma;
  }

  return ema;
}

export function calculateRSI(closes: number[], period: number = 14): number {
  assertNonEmptyCloses(closes);
  assertPositivePeriod(period, "period");

  if (closes.length < period + 1) {
    throw new Error(
      `RSI hisoblash uchun kamida ${period + 1} ta close qiymati kerak`,
    );
  }

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i]! - closes[i - 1]!);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i]!;
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const change = changes[i]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateTrueRanges(candles: Candle[]): number[] {
  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i]!;
    const previousClose = candles[i - 1]!.close;

    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previousClose),
        Math.abs(current.low - previousClose),
      ),
    );
  }

  return trueRanges;
}

export function calculateATR(candles: Candle[], period: number = 14): number {
  assertNonEmptyCandles(candles);
  assertPositivePeriod(period, "period");

  const trueRanges = calculateTrueRanges(candles);

  if (trueRanges.length < period) {
    throw new Error(
      `ATR hisoblash uchun kamida ${period + 1} ta candle kerak`,
    );
  }

  let atr =
    trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) /
    period;

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]!) / period;
  }

  return atr;
}

export function findSwingLows(
  candles: Candle[],
  left: number = 3,
  right: number = 3,
): SwingPoint[] {
  const swings: SwingPoint[] = [];

  for (let i = left; i < candles.length - right; i++) {
    const pivot = candles[i]!.low;
    let isLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j]!.low <= pivot) {
        isLow = false;
        break;
      }
    }

    if (isLow) {
      swings.push({ index: i, price: pivot });
    }
  }

  return swings;
}

export function findSwingHighs(
  candles: Candle[],
  left: number = 3,
  right: number = 3,
): SwingPoint[] {
  const swings: SwingPoint[] = [];

  for (let i = left; i < candles.length - right; i++) {
    const pivot = candles[i]!.high;
    let isHigh = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j]!.high >= pivot) {
        isHigh = false;
        break;
      }
    }

    if (isHigh) {
      swings.push({ index: i, price: pivot });
    }
  }

  return swings;
}

/**
 * Structural support/resistance from confirmed swing pivots, falling back to the
 * raw low/high range when no pivots are present. Using pivots instead of the
 * absolute min/max filters out single-candle wicks that distort entry zones.
 */
export function findSupportResistance(
  candles: Candle[],
  lookback: number = 30,
): SupportResistance {
  assertNonEmptyCandles(candles);
  assertPositivePeriod(lookback, "lookback");

  const recent = candles.slice(-lookback);
  const rawSupport = Math.min(...recent.map((candle) => candle.low));
  const rawResistance = Math.max(...recent.map((candle) => candle.high));

  const swingLows = findSwingLows(recent).map((swing) => swing.price);
  const swingHighs = findSwingHighs(recent).map((swing) => swing.price);

  return {
    support: swingLows.length > 0 ? Math.min(...swingLows) : rawSupport,
    resistance: swingHighs.length > 0 ? Math.max(...swingHighs) : rawResistance,
  };
}

export function getVolumeStatus(candles: Candle[]): VolumeStatus {
  assertNonEmptyCandles(candles);

  const sampleSize = Math.min(20, candles.length);
  const recent = candles.slice(-sampleSize);
  const averageVolume =
    recent.reduce((sum, candle) => sum + candle.volume, 0) / sampleSize;
  const lastVolume = candles[candles.length - 1]!.volume;

  if (averageVolume === 0) {
    return "normal";
  }

  const ratio = lastVolume / averageVolume;

  if (ratio > 1.5) {
    return "high";
  }

  if (ratio < 0.5) {
    return "low";
  }

  return "normal";
}
