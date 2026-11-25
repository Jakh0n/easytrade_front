import type { Candle } from "../../types/index";

const BAR_MS = 3_600_000;
const START_TIME = Date.UTC(2024, 0, 1);

export interface CandleShape {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function makeCandle(shape: CandleShape, index: number = 0): Candle {
  const openTime = START_TIME + index * BAR_MS;

  return {
    openTime,
    closeTime: openTime + BAR_MS - 1,
    open: shape.open,
    high: shape.high,
    low: shape.low,
    close: shape.close,
    volume: shape.volume ?? 1_000,
  };
}

export function makeCandles(shapes: CandleShape[]): Candle[] {
  return shapes.map((shape, index) => makeCandle(shape, index));
}

/** Flat-ish series with a small deterministic wiggle, for warmup padding. */
export function flatSeries(
  count: number,
  price: number,
  wiggle: number = 0.5,
  startIndex: number = 0,
): Candle[] {
  return Array.from({ length: count }, (_unused, offset) => {
    const drift = (offset % 2 === 0 ? 1 : -1) * wiggle;
    const close = price + drift;

    return makeCandle(
      {
        open: price,
        high: Math.max(price, close) + wiggle,
        low: Math.min(price, close) - wiggle,
        close,
      },
      startIndex + offset,
    );
  });
}

/**
 * Candles built straight from a close series. Highs and lows hug the body, which
 * keeps price paths exact for tests that only care about closes.
 */
export function seriesFromCloses(
  closes: number[],
  startIndex: number = 0,
): Candle[] {
  return closes.map((close, offset) => {
    const open = offset === 0 ? close : closes[offset - 1]!;

    return makeCandle(
      {
        open,
        high: Math.max(open, close),
        low: Math.min(open, close),
        close,
      },
      startIndex + offset,
    );
  });
}

/** Steadily rising series, used to verify trend-strength indicators. */
export function risingSeries(
  count: number,
  startPrice: number,
  step: number,
  startIndex: number = 0,
): Candle[] {
  return Array.from({ length: count }, (_unused, offset) => {
    const open = startPrice + offset * step;
    const close = open + step;

    return makeCandle(
      { open, high: close + step * 0.2, low: open - step * 0.2, close },
      startIndex + offset,
    );
  });
}
