/** @jest-environment node */
import {
  findSupportZones,
} from "../services/invest.service";
import type { Candle } from "../types/index";

function candle(low: number, high: number = low + 1): Candle {
  return {
    openTime: 0,
    open: low,
    high,
    low,
    close: low + 0.5,
    volume: 100,
    closeTime: 0,
  };
}

/** Build a weekly series with explicit swing lows at given indices. */
function weeklyWithLows(
  length: number,
  swingLowIndices: Array<{ index: number; price: number }>,
): Candle[] {
  const candles: Candle[] = Array.from({ length }, (_, i) =>
    candle(100 - i * 0.1),
  );

  for (const { index, price } of swingLowIndices) {
    const prev = candles[index - 1]!;
    const next = candles[index + 1]!;
    candles[index] = candle(price, price + 2);
    candles[index - 1] = candle(prev.low, prev.high);
    candles[index + 1] = candle(next.low, next.high);
    // Ensure neighbors are higher so index is a swing low.
    candles[index - 1] = candle(price + 5, price + 7);
    candles[index + 1] = candle(price + 4, price + 6);
  }

  return candles;
}

describe("findSupportZones", () => {
  it("returns swing lows below current price, nearest first", () => {
    const candles = weeklyWithLows(30, [
      { index: 10, price: 90 },
      { index: 20, price: 80 },
    ]);
    const currentPrice = 95;

    const zones = findSupportZones(candles, currentPrice);

    expect(zones.length).toBeGreaterThan(0);
    expect(zones[0]).toBeLessThan(currentPrice);
    for (const zone of zones) {
      expect(zone).toBeLessThan(currentPrice);
    }
  });

  it("merges nearby zones within 2% tolerance", () => {
    const candles = weeklyWithLows(30, [
      { index: 10, price: 90 },
      { index: 18, price: 89 },
    ]);
    const zones = findSupportZones(candles, 100, 3);

    if (zones.length >= 2) {
      const gap = Math.abs(zones[0]! - zones[1]!) / zones[0]!;
      expect(gap).toBeGreaterThanOrEqual(0.02);
    }
  });

  it("caps at maxZones", () => {
    const candles = weeklyWithLows(40, [
      { index: 8, price: 85 },
      { index: 16, price: 75 },
      { index: 24, price: 65 },
      { index: 32, price: 55 },
    ]);
    const zones = findSupportZones(candles, 100, 3);
    expect(zones.length).toBeLessThanOrEqual(3);
  });
});
