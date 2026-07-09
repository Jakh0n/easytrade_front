/** @jest-environment node */
import {
  detectCandlePattern,
  patternMatchesSide,
} from "../services/patterns.service";
import type { Candle } from "../types/index";

function candle(
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 100,
): Candle {
  return { openTime: 0, open, high, low, close, volume, closeTime: 0 };
}

/** Neutral filler candles so volume averaging has enough history. */
function filler(count: number, volume: number = 100): Candle[] {
  return Array.from({ length: count }, () => candle(100, 101, 99, 100, volume));
}

describe("detectCandlePattern", () => {
  it("detects a bullish engulfing with volume confirmation", () => {
    const candles = [
      ...filler(12, 100),
      candle(101, 102, 98, 99),
      candle(98.5, 103, 98, 102.5, 250),
    ];

    const pattern = detectCandlePattern(candles);

    expect(pattern?.type).toBe("bullish_engulfing");
    expect(pattern?.direction).toBe("bullish");
    expect(pattern?.volumeConfirmed).toBe(true);
  });

  it("detects a bearish engulfing", () => {
    const candles = [
      ...filler(12),
      candle(99, 102, 98.5, 101),
      candle(101.5, 102, 97, 98),
    ];

    expect(detectCandlePattern(candles)?.type).toBe("bearish_engulfing");
  });

  it("detects a hammer (long lower wick)", () => {
    const candles = [...filler(12), candle(100, 100.6, 96, 100.5)];

    const pattern = detectCandlePattern(candles);

    expect(pattern?.type).toBe("hammer");
    expect(pattern?.direction).toBe("bullish");
  });

  it("detects a shooting star (long upper wick)", () => {
    const candles = [...filler(12), candle(100, 104, 99.9, 99.95)];

    const pattern = detectCandlePattern(candles);

    expect(pattern?.type).toBe("shooting_star");
    expect(pattern?.direction).toBe("bearish");
  });

  it("returns null for a plain candle", () => {
    const candles = [...filler(12), candle(100, 101.2, 99.4, 100.8)];
    expect(detectCandlePattern(candles)).toBeNull();
  });
});

describe("patternMatchesSide", () => {
  const bullish = detectCandlePattern([
    ...filler(12),
    candle(100, 100.6, 96, 100.5),
  ]);

  it("matches bullish pattern with a long", () => {
    expect(patternMatchesSide(bullish, "long")).toBe(true);
  });

  it("rejects bullish pattern for a short", () => {
    expect(patternMatchesSide(bullish, "short")).toBe(false);
  });

  it("rejects null side", () => {
    expect(patternMatchesSide(bullish, null)).toBe(false);
  });
});
