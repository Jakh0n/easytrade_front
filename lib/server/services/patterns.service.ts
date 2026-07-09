import type {
  Candle,
  CandlePattern,
  PatternDirection,
  PatternType,
  TradeSide,
} from "../types/index";

export type { CandlePattern, PatternDirection, PatternType };

const PATTERN_LABELS: Record<PatternType, string> = {
  bullish_engulfing: "Bullish engulfing",
  bearish_engulfing: "Bearish engulfing",
  hammer: "Hammer / pin bar",
  shooting_star: "Shooting star",
};

const VOLUME_LOOKBACK = 10;
// Wick must be at least this multiple of the body for hammer/shooting star.
const WICK_BODY_RATIO = 2;

/** Signal candle volume above the average of the prior N candles. */
function isVolumeConfirmed(candles: Candle[]): boolean {
  if (candles.length < VOLUME_LOOKBACK + 1) {
    return false;
  }

  const last = candles[candles.length - 1]!;
  const prior = candles.slice(-(VOLUME_LOOKBACK + 1), -1);
  const average =
    prior.reduce((sum, candle) => sum + candle.volume, 0) / prior.length;

  return average > 0 && last.volume > average;
}

function buildPattern(
  type: PatternType,
  direction: PatternDirection,
  volumeConfirmed: boolean,
): CandlePattern {
  return { type, label: PATTERN_LABELS[type], direction, volumeConfirmed };
}

/**
 * Detects a reversal/confirmation candlestick pattern on the most recent candle.
 * Engulfing patterns take priority over single-candle wicks because they carry
 * two-candle context. Returns null when no clean pattern is present.
 */
export function detectCandlePattern(candles: Candle[]): CandlePattern | null {
  if (candles.length < 2) {
    return null;
  }

  const current = candles[candles.length - 1]!;
  const previous = candles[candles.length - 2]!;

  const range = current.high - current.low;
  if (range <= 0) {
    return null;
  }

  const body = Math.abs(current.close - current.open);
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const volumeConfirmed = isVolumeConfirmed(candles);

  const currentBullish = current.close > current.open;
  const currentBearish = current.close < current.open;
  const previousBullish = previous.close > previous.open;
  const previousBearish = previous.close < previous.open;

  const engulfsPreviousBody =
    Math.max(current.open, current.close) >=
      Math.max(previous.open, previous.close) &&
    Math.min(current.open, current.close) <=
      Math.min(previous.open, previous.close);

  const strongBody = body > range * 0.5;

  if (currentBullish && previousBearish && engulfsPreviousBody && strongBody) {
    return buildPattern("bullish_engulfing", "bullish", volumeConfirmed);
  }

  if (currentBearish && previousBullish && engulfsPreviousBody && strongBody) {
    return buildPattern("bearish_engulfing", "bearish", volumeConfirmed);
  }

  if (body > 0 && lowerWick >= body * WICK_BODY_RATIO && upperWick <= body) {
    return buildPattern("hammer", "bullish", volumeConfirmed);
  }

  if (body > 0 && upperWick >= body * WICK_BODY_RATIO && lowerWick <= body) {
    return buildPattern("shooting_star", "bearish", volumeConfirmed);
  }

  return null;
}

export function patternMatchesSide(
  pattern: CandlePattern | null,
  side: TradeSide,
): boolean {
  if (!pattern || side === null) {
    return false;
  }

  return side === "long"
    ? pattern.direction === "bullish"
    : pattern.direction === "bearish";
}
