import {
  computeDayBias,
  computeSupertrend,
  evaluateDayOutcome,
} from "../services/day-strategy/engine";
import { buildDayFromCandles } from "../services/day.strategy.service";
import { makeCandles, type CandleShape } from "./helpers/candles";

/** Har bar `step` ga siljiydigan, kichik tebranishli trend. */
function trend(count: number, start: number, step: number): CandleShape[] {
  return Array.from({ length: count }, (_u, i) => {
    const open = start + i * step;
    const close = open + step;
    return { open, close, high: Math.max(open, close) + 0.3, low: Math.min(open, close) - 0.3 };
  });
}

describe("Day strategy — Supertrend", () => {
  it("follows an uptrend and flips on a sharp reversal", () => {
    const shapes = [...trend(60, 100, 1), ...trend(20, 160, -3)];
    const { dir, line } = computeSupertrend(makeCandles(shapes), 10, 3);
    expect(dir[55]).toBe(1);
    expect(line[55]).toBeLessThan(shapes[55]!.close);
    expect(dir.at(-1)).toBe(-1);
    expect(line.at(-1)).toBeGreaterThan(shapes.at(-1)!.close);
  });

  it("keeps the lower band non-decreasing while the trend is up", () => {
    const { dir, line } = computeSupertrend(makeCandles(trend(80, 100, 1)), 10, 3);
    for (let i = 20; i < 80; i++) {
      expect(dir[i]).toBe(1);
      expect(line[i]!).toBeGreaterThanOrEqual(line[i - 1]!);
    }
  });

  it("derives the 1H bias from EMA 50/200", () => {
    expect(computeDayBias(makeCandles(trend(260, 100, 1)))).toBe("bullish");
    expect(computeDayBias(makeCandles(trend(260, 400, -1)))).toBe("bearish");
    expect(computeDayBias(makeCandles(trend(100, 100, 1)))).toBeNull();
  });
});

describe("Day strategy — outcome", () => {
  const candles = makeCandles([...trend(40, 100, -1), ...trend(40, 60, 1), ...trend(15, 100, -3)]);
  const { dir, line } = computeSupertrend(candles);
  const flip = dir.findIndex((d, i) => i > 40 && d === 1 && dir[i - 1] === -1);

  it("exits on the opposite flip at that bar's close", () => {
    expect(flip).toBeGreaterThan(40);
    const signal = { side: "long" as const, entry: candles[flip]!.close, stopLoss: line[flip]!, signalTime: candles[flip]!.openTime };
    const outcome = evaluateDayOutcome(signal, candles);
    expect(["exit", "sl"]).toContain(outcome.status);
    expect(outcome.resultR).not.toBeNull();
    // Trend davomida foyda yig'ilgan — natija musbat bo'lishi kerak.
    expect(outcome.resultR!).toBeGreaterThan(0);
  });

  it("returns -1R when the stop is hit", () => {
    const entry = candles[flip]!.close;
    const stopLoss = entry - 0.5;
    // Keyingi sham stopdan pastga tushib, yana yuqorida yopiladi — flip yo'q, faqat stop.
    const wicked = candles.map((c, i) => (i === flip + 1 ? { ...c, low: stopLoss - 1 } : c));
    const signal = { side: "long" as const, entry, stopLoss, signalTime: candles[flip]!.openTime };
    const outcome = evaluateDayOutcome(signal, wicked);
    expect(outcome.status).toBe("sl");
    expect(outcome.resultR).toBeCloseTo(-1, 5);
  });

  it("stays open while the trend continues", () => {
    const upOnly = candles.slice(0, flip + 5);
    const signal = { side: "long" as const, entry: upOnly[flip]!.close, stopLoss: line[flip]!, signalTime: upOnly[flip]!.openTime };
    expect(evaluateDayOutcome(signal, upOnly).status).toBe("open");
  });
});

describe("Day strategy — analysis", () => {
  it("signals enter on a fresh flip aligned with the 1H trend", () => {
    const htf = makeCandles(trend(260, 100, 1));
    const base = makeCandles([...trend(60, 100, -1), ...trend(30, 40, 1.5)]);
    const { dir } = computeSupertrend(base);
    const flip = dir.findIndex((d, i) => i > 60 && d === 1 && dir[i - 1] === -1);
    const candles = base.slice(0, flip + 1);

    const result = buildDayFromCandles("BTCUSDT", "futures", candles, htf);
    expect(result.side).toBe("long");
    expect(result.verdict).toBe("enter");
    expect(result.flipBarsAgo).toBe(0);
    expect(result.stopLoss).toBeLessThan(result.entry);
  });

  it("avoids when the 1H trend is undefined", () => {
    const result = buildDayFromCandles("BTCUSDT", "futures", makeCandles(trend(80, 100, 1)), makeCandles(trend(50, 100, 1)));
    expect(result.verdict).toBe("avoid");
  });
});
