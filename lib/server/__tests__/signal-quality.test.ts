import { buildFeatures, computeFeatureSeries, fundingAt } from "../services/signal-model/features";
import { fitLogistic, predictProbability } from "../services/signal-model/model";
import { SMC_SIGNAL_MODEL } from "../services/signal-model/weights";
import { emaStack, mtfRuleAllows } from "../services/signal-quality.service";
import type { Candle } from "../types/index";

const H = 3_600_000;
function candles(closes: number[], takerShare = 0.6): Candle[] {
  return closes.map((close, i) => ({
    openTime: i * H,
    closeTime: (i + 1) * H - 1,
    open: close * 0.999,
    high: close * 1.004,
    low: close * 0.996,
    close,
    volume: 100,
    takerBuyVolume: 100 * takerShare,
  }));
}
const up = (n: number) => Array.from({ length: n }, (_, i) => 100 + i * 0.5);

describe("signal sifati", () => {
  it("EMA tartibi va MTF qoidalari", () => {
    expect(emaStack(candles(up(260)))).toBe(1);
    expect(emaStack(candles(up(260).reverse()))).toBe(-1);
    expect(emaStack(candles(up(50)))).toBe(0);
    expect(mtfRuleAllows("stack", 1, "long")).toBe(true);
    expect(mtfRuleAllows("stack", 0, "long")).toBe(false);
    expect(mtfRuleAllows("notAgainst", 0, "short")).toBe(true);
    expect(mtfRuleAllows("notAgainst", 1, "short")).toBe(false);
  });

  it("xususiyatlar savdo tomoniga yo'naltirilgan", () => {
    const cs = candles(up(100), 0.7);
    const series = computeFeatureSeries(cs);
    const base = { candles: cs, series, index: 99, barMs: H, regime: null, funding: { last: 0.0001, mean7d: 0.0002 } };
    const long = buildFeatures({ ...base, side: "long" });
    const short = buildFeatures({ ...base, side: "short" });
    expect(long.taker1).toBeCloseTo(0.2);
    expect(short.taker1).toBeCloseTo(-0.2);
    expect(long.funding).toBeCloseTo(1);
    expect(short.funding7d).toBeCloseTo(-2);
    expect(long.ret24).toBeGreaterThan(0);
    expect(Object.values(long).every(Number.isFinite)).toBe(true);
  });

  it("funding — vaqtgacha bo'lgan oxirgi stavka (look-ahead yo'q)", () => {
    const f = [
      { t: 0, r: 0.0001 },
      { t: 8 * H, r: 0.0003 },
      { t: 16 * H, r: 0.0009 },
    ];
    expect(fundingAt(f, 10 * H).last).toBe(0.0003);
    expect(fundingAt(f, 10 * H).mean7d).toBeCloseTo(0.0002);
    expect(fundingAt(f, -1).last).toBe(0);
  });

  it("logistik model ajratuvchi xususiyatni o'rganadi", () => {
    const rows = Array.from({ length: 400 }, (_, i) => {
      const x = (i % 20) - 10;
      return { adx: x, rsi: 0, atrPct: 0, ext: 0, volRatio: 0, taker1: 0, taker6: 0, ret24: 0, funding: 0, funding7d: 0,
        regBtc: 0, regAlt: 0, regDom: 0, breadth: 0, hourSin: 0, hourCos: 0 };
    });
    const labels = rows.map((r) => (r.adx > 0 ? 1 : 0));
    const model = fitLogistic(rows, labels, { features: ["adx"] });
    expect(predictProbability(model, { ...rows[0]!, adx: 8 })).toBeGreaterThan(0.8);
    expect(predictProbability(model, { ...rows[0]!, adx: -8 })).toBeLessThan(0.2);
  });

  it("SMC modeli to'liq va chegara 0–1 oralig'ida", () => {
    const k = SMC_SIGNAL_MODEL.features.length;
    expect(SMC_SIGNAL_MODEL.mean).toHaveLength(k);
    expect(SMC_SIGNAL_MODEL.weights).toHaveLength(k);
    expect(SMC_SIGNAL_MODEL.threshold).toBeGreaterThan(0);
    expect(SMC_SIGNAL_MODEL.threshold).toBeLessThan(1);
  });
});
