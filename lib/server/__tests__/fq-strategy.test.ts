import {
  FQ_SWING_CONFIG,
  computeFqLevels,
  computeFqSeries,
  computeHtfBias,
  evaluateFqBar,
} from "../services/fq-strategy/engine";
import { FQ_PROFILES, buildFqFromCandles } from "../services/fq.strategy.service";
import { makeCandles, type CandleShape } from "./helpers/candles";

function trendShapes(count: number, start: number, step: number): CandleShape[] {
  return Array.from({ length: count }, (_u, i) => {
    const base = start + i * step;
    const wiggle = i % 3 === 0 ? -0.4 : 0.6;
    const open = base;
    const close = base + step + wiggle * Math.sign(step || 1);
    return {
      open,
      close,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      volume: 1000,
    };
  });
}

describe("FQ Strategy v3 engine", () => {
  it("detects an uptrend and a bullish HTF bias", () => {
    const candles = makeCandles(trendShapes(300, 100, 1));
    expect(computeHtfBias(candles, 200)).toBe("bullish");
    const series = computeFqSeries(candles);
    const state = evaluateFqBar(series, candles.length - 1, "bullish");
    expect(state).not.toBeNull();
    expect(state!.upTrend).toBe(true);
    expect(state!.dnTrend).toBe(false);
  });

  it("htf filter blocks the trend when HTF disagrees", () => {
    const candles = makeCandles(trendShapes(300, 100, 1));
    const state = evaluateFqBar(computeFqSeries(candles), candles.length - 1, "bearish");
    expect(state!.upTrend).toBe(false);
  });

  it("fires a breakout long on a high-volume range break", () => {
    const shapes = trendShapes(300, 100, 0.3);
    const last = shapes.at(-1)!;
    shapes.push({
      open: last.close,
      close: last.close + 3,
      high: last.close + 3.2,
      low: last.close - 0.1,
      volume: 5000,
    });
    const candles = makeCandles(shapes);
    const state = evaluateFqBar(computeFqSeries(candles), candles.length - 1, "bullish");
    expect(state!.boLong).toBe(true);
  });

  it("levels respect min risk and R multiples", () => {
    const candles = makeCandles(trendShapes(300, 100, 1));
    const state = evaluateFqBar(computeFqSeries(candles), candles.length - 1, "bullish")!;
    const levels = computeFqLevels(state, "long");
    expect(levels.risk).toBeGreaterThanOrEqual(state.atr * FQ_SWING_CONFIG.minRiskAtr);
    expect(levels.stopLoss).toBeLessThan(levels.entry);
    expect(levels.tp1 - levels.entry).toBeCloseTo(levels.risk * FQ_SWING_CONFIG.tp1R);
    expect(levels.tp2 - levels.entry).toBeCloseTo(levels.risk * FQ_SWING_CONFIG.tp2R);
  });

  it("builds an analysis response; spot never returns short", () => {
    const down = makeCandles(trendShapes(300, 500, -1));
    const spot = buildFqFromCandles("ethusdt", "spot", down, down);
    expect(spot.strategyId).toBe("fq_v3");
    expect(spot.side).toBeNull();
    expect(spot.verdict).toBe("avoid");

    const fut = buildFqFromCandles("ethusdt", "futures", down, down);
    expect(fut.side).toBe("short");
    expect(fut.checklist).toHaveLength(7);
    expect(fut.symbol).toBe("ETHUSDT");
  });

  it("Swing 4H profile labels the response and adds a Fib checklist item", () => {
    const down = makeCandles(trendShapes(300, 500, -1));
    const profile = FQ_PROFILES.fq_4h;
    const res = buildFqFromCandles("btcusdt", "futures", down, down, profile.config, profile);
    expect(res.strategyId).toBe("fq_4h");
    expect(res.timeframe).toBe("4h");
    expect(res.htfTimeframe).toBe("1d");
    expect(res.checklist.some((c) => c.label.startsWith("Fib"))).toBe(true);
    expect(Array.isArray(res.confluences)).toBe(true);
  });
});
