/** @jest-environment node */
import {
  calculateATR,
  calculateEMA,
  calculateRSI,
} from "../services/indicators.service";
import type { Candle } from "../types/index";

describe("indicators", () => {
  it("returns an EMA series matching the input length", () => {
    const ema = calculateEMA([1, 2, 3, 4, 5, 6], 3);
    expect(ema).toHaveLength(6);
    expect(Number.isFinite(ema[5] as number)).toBe(true);
  });

  it("reports a high RSI for a steady uptrend", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(calculateRSI(closes, 14)).toBeGreaterThan(70);
  });

  it("reports a low RSI for a steady downtrend", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(calculateRSI(closes, 14)).toBeLessThan(30);
  });

  it("computes a positive ATR", () => {
    const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      openTime: i,
      open: 100,
      high: 105,
      low: 95,
      close: 100,
      volume: 10,
      closeTime: i,
    }));
    expect(calculateATR(candles, 14)).toBeGreaterThan(0);
  });
});
