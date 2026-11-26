import { SMC_CONFIG, computeSmcSeries, resolvePending, smcSetupAt } from "../services/smc/engine";
import { makeCandle, seriesFromCloses } from "./helpers/candles";

const long = { side: "long" as const, entry: 100, stopLoss: 90, invalidate: 120 };
const bar = (i: number, low: number, high: number) => makeCandle({ open: (low + high) / 2, close: (low + high) / 2, low, high }, i);

describe("SMC limit order resolution", () => {
  it("fills when price trades down to the limit", () => {
    const res = resolvePending(long, [bar(0, 105, 110), bar(1, 99, 104)]);
    expect(res).toEqual({ state: "filled", index: 1, stoppedOnFill: false });
  });

  it("counts a stop hit on the fill bar", () => {
    const res = resolvePending(long, [bar(0, 89, 104)]);
    expect(res).toEqual({ state: "filled", index: 0, stoppedOnFill: true });
  });

  it("cancels when price breaks the impulse high before filling", () => {
    const res = resolvePending(long, [bar(0, 105, 110), bar(1, 108, 121)]);
    expect(res.state).toBe("cancelled");
    expect(res.state === "cancelled" && res.reason).toBe("invalidated");
  });

  it("expires after maxWait bars and stays pending before that", () => {
    const bars = Array.from({ length: 5 }, (_u, i) => bar(i, 105, 110));
    expect(resolvePending(long, bars.slice(0, 2), 5).state).toBe("pending");
    const res = resolvePending(long, bars, 5);
    expect(res.state === "cancelled" && res.reason).toBe("expired");
  });
});

describe("SMC setup detection", () => {
  it("places a 0.618 OTE limit after a bullish BOS with HTF agreement", () => {
    // Warmup → swing low ~100 → swing high 110 → pullback → impulsiv sinish 125.
    const warm = Array.from({ length: 260 }, (_u, i) => 100 + Math.sin(i / 3) * 1.5);
    const closes = [...warm, 98, 96, 95, 97, 101, 105, 108, 110, 107, 104, 103, 106, 112, 118, 125];
    const candles = seriesFromCloses(closes);
    const series = computeSmcSeries(candles, { ...SMC_CONFIG, minLegAtr: 1 });
    const t = series.structure.findIndex((s, i) => i > 260 && s.bosUp);
    expect(t).toBeGreaterThan(260);
    const setup = smcSetupAt(series, t, 1, { ...SMC_CONFIG, minLegAtr: 1 });
    expect(setup).not.toBeNull();
    const size = setup!.legHigh - setup!.legLow;
    expect(setup!.entry).toBeCloseTo(setup!.legHigh - 0.618 * size);
    expect(setup!.stopLoss).toBeLessThan(setup!.legLow);
    expect(setup!.tp1).toBe(setup!.legHigh);
    // HTF qarshi bo'lsa — setup yo'q.
    expect(smcSetupAt(series, t, -1, { ...SMC_CONFIG, minLegAtr: 1 })).toBeNull();
  });
});
