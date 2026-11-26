import { calculateATRSeries } from "../services/indicators.series";
import { computeStructure, retracement } from "../services/fq-strategy/structure";
import { computeFqSeries, evaluateFqBar, FQ_SWING_CONFIG } from "../services/fq-strategy/engine";
import { makeCandles, seriesFromCloses } from "./helpers/candles";

/** Deterministik "random walk" — real bozorga o'xshash shovqin. */
function randomWalk(count: number, seed: number = 7): number[] {
  let x = seed;
  const rand = () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return x / 2 ** 31;
  };
  const closes = [100];
  for (let i = 1; i < count; i++) closes.push(closes[i - 1]! * (1 + (rand() - 0.5) * 0.03));
  return closes;
}

function withWicks(closes: number[]) {
  return makeCandles(
    closes.map((close, i) => {
      const open = i === 0 ? close : closes[i - 1]!;
      return { open, close, high: Math.max(open, close) * 1.004, low: Math.min(open, close) * 0.996 };
    }),
  );
}

describe("market structure", () => {
  it("has no look-ahead: a prefix gives identical bars", () => {
    const candles = withWicks(randomWalk(600));
    const atr = calculateATRSeries(candles, 14);
    const full = computeStructure(candles, atr);
    for (const cut of [120, 333, 480]) {
      const prefix = computeStructure(candles.slice(0, cut), atr.slice(0, cut));
      expect(prefix).toEqual(full.slice(0, cut));
    }
  });

  it("engine signals do not change when future candles are appended", () => {
    const candles = withWicks(randomWalk(800, 11));
    const config = { ...FQ_SWING_CONFIG, useFibZone: true, useOrderBlock: true, useStructure: true };
    const full = computeFqSeries(candles, config);
    const prefix = computeFqSeries(candles.slice(0, 500), config);
    for (let i = 300; i < 500; i++) {
      const a = evaluateFqBar(full, i, "bullish", config);
      const b = evaluateFqBar(prefix, i, "bullish", config);
      expect(b?.longSig).toBe(a?.longSig);
      expect(b?.confluencesLong).toEqual(a?.confluencesLong);
    }
  });

  it("detects a bullish BOS, creates an order block and flags its first retest", () => {
    // Pastga → swing high 110 → pullback 104 (OB) → 110 dan yuqori sinish → OB ga qaytish.
    const closes = [
      100, 102, 104, 106, 108, 110, 108, 106, 105, 104, 106, 108, 110, 112, 114, 116, 113, 110, 107, 105, 106, 109,
    ];
    const candles = seriesFromCloses(closes);
    const atr = candles.map(() => 3);
    const bars = computeStructure(candles, atr, { pivotLeft: 3, pivotRight: 2, obMaxAge: 100, obMaxAtr: 5, sweepMaxAge: 50 });

    const bos = bars.findIndex((b) => b.bosUp);
    expect(bos).toBe(13); // close 112 > swing high 110 (index 5)
    expect(bars[bos]!.bias).toBe("bull");

    const touch = bars.findIndex((b) => b.obLong !== null);
    expect(touch).toBeGreaterThan(bos);
    expect(bars[touch]!.obLong!.bottom).toBe(104); // eng past sham: 105 → 104
    // Faqat birinchi tegish.
    expect(bars.slice(touch + 1).some((b) => b.obLong !== null)).toBe(false);
  });

  it("detects a liquidity sweep of a swing low", () => {
    const closes = [110, 108, 106, 104, 102, 100, 102, 104, 106, 105, 104, 103];
    const candles = seriesFromCloses(closes);
    // Oxirgi sham: soya 99 gacha (swing low 100 ostida), close 103 — qaytdi.
    candles.push({ ...candles.at(-1)!, openTime: candles.at(-1)!.openTime + 3_600_000, closeTime: candles.at(-1)!.closeTime + 3_600_000, open: 103, low: 99, high: 104, close: 103.5 });
    const bars = computeStructure(candles, candles.map(() => 2), { pivotLeft: 3, pivotRight: 2, obMaxAge: 100, obMaxAtr: 5, sweepMaxAge: 50 });
    expect(bars.at(-1)!.sweepLong).toEqual({ level: 100, extreme: 99 });
  });

  it("measures fibonacci retracement of an impulse leg", () => {
    const leg = { low: 100, high: 200, lowIndex: 0, highIndex: 10 };
    expect(retracement(leg, 138.2, "long")).toBeCloseTo(0.618);
    expect(retracement(leg, 161.8, "short")).toBeCloseTo(0.618);
  });
});
