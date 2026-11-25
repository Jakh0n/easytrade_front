/** @jest-environment node */
import {
  calculateADXSeries,
  calculateATRSeries,
  calculateRSISeries,
  emaSlopeInAtr,
  percentileRank,
} from "../services/indicators.series";
import { calculateATR, calculateRSI } from "../services/indicators.service";
import { flatSeries, risingSeries } from "./helpers/candles";

describe("calculateRSISeries", () => {
  it("matches the scalar RSI at the final index", () => {
    const closes = risingSeries(80, 100, 1).map((candle) => candle.close);
    const series = calculateRSISeries(closes, 14);

    expect(series[series.length - 1]).toBeCloseTo(calculateRSI(closes, 14), 6);
  });

  it("leaves bars before the seed period as NaN", () => {
    const closes = risingSeries(30, 100, 1).map((candle) => candle.close);
    const series = calculateRSISeries(closes, 14);

    expect(series.slice(0, 14).every(Number.isNaN)).toBe(true);
    expect(Number.isFinite(series[14]!)).toBe(true);
  });

  it("returns all NaN when there is not enough data to seed", () => {
    expect(calculateRSISeries([1, 2, 3], 14).every(Number.isNaN)).toBe(true);
  });
});

describe("calculateATRSeries", () => {
  it("matches the scalar ATR at the final index", () => {
    const candles = risingSeries(60, 100, 1);
    const series = calculateATRSeries(candles, 14);

    expect(series[series.length - 1]).toBeCloseTo(calculateATR(candles, 14), 6);
  });
});

describe("calculateADXSeries", () => {
  it("reports strong upward trend strength on a one-way rally", () => {
    const { adx, plusDi, minusDi } = calculateADXSeries(
      risingSeries(120, 100, 1),
      14,
    );
    const last = adx.length - 1;

    expect(adx[last]!).toBeGreaterThan(40);
    expect(plusDi[last]!).toBeGreaterThan(minusDi[last]!);
  });

  it("reports weak trend strength on a choppy flat market", () => {
    const { adx } = calculateADXSeries(flatSeries(200, 100, 1), 14);
    const last = adx.length - 1;

    expect(adx[last]!).toBeLessThan(25);
  });

  it("returns NaN until both smoothing stages are seeded", () => {
    const { adx } = calculateADXSeries(risingSeries(40, 100, 1), 14);

    expect(Number.isNaN(adx[26]!)).toBe(true);
    expect(Number.isFinite(adx[27]!)).toBe(true);
  });
});

describe("percentileRank", () => {
  it("ranks a value against its window", () => {
    expect(percentileRank([1, 2, 3, 4], 4)).toBe(100);
    expect(percentileRank([1, 2, 3, 4], 2)).toBe(50);
  });

  it("ignores non-finite window entries", () => {
    expect(percentileRank([NaN, 1, 2], 2)).toBe(100);
  });

  it("returns NaN when the window has no usable values", () => {
    expect(Number.isNaN(percentileRank([NaN, NaN], 1))).toBe(true);
  });
});

describe("emaSlopeInAtr", () => {
  it("expresses the rise over the lookback in ATR units", () => {
    const ema = [100, 101, 102, 103, 104];

    expect(emaSlopeInAtr(ema, 4, 2, 4)).toBeCloseTo(2);
  });

  it("returns NaN when the lookback reaches before the series starts", () => {
    expect(Number.isNaN(emaSlopeInAtr([100, 101], 1, 2, 10))).toBe(true);
  });
});
