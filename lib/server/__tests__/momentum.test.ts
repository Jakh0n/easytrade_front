import { basketReturn, buildBasket, momentumScore, weekStart, type DailySeries } from "../services/momentum/engine";

function series(symbol: string, dailyGrowth: number, volume = 1e7, wiggle = 0.01, days = 100): DailySeries {
  const closes: number[] = [];
  let p = 100;
  for (let i = 0; i < days; i++) {
    p *= 1 + dailyGrowth + (i % 2 === 0 ? wiggle : -wiggle);
    closes.push(p);
  }
  return { symbol, closes, dollarVolumes: closes.map(() => volume) };
}

describe("momentum basket", () => {
  it("longs the strongest and shorts the weakest risk-adjusted trends", () => {
    const coins = Array.from({ length: 30 }, (_u, i) => series(`C${i}USDT`, (i - 15) / 1000));
    const basket = buildBasket(coins);
    expect(basket.universe).toBe(30);
    expect(basket.longs).toHaveLength(3);
    expect(basket.shorts).toHaveLength(3);
    expect(basket.longs[0]!.symbol).toBe("C29USDT");
    expect(basket.shorts[0]!.symbol).toBe("C0USDT");
    const gross = [...basket.longs, ...basket.shorts].reduce((a, l) => a + l.weight, 0);
    expect(gross).toBeCloseTo(1);
  });

  it("ignores coins younger than the minimum age and illiquid ones beyond top N", () => {
    const coins = [
      ...Array.from({ length: 20 }, (_u, i) => series(`A${i}USDT`, 0.001 * (i % 5))),
      series("NEWUSDT", 0.05, 1e9, 0.01, 40),
    ];
    const basket = buildBasket(coins);
    expect([...basket.longs, ...basket.shorts].some((l) => l.symbol === "NEWUSDT")).toBe(false);
  });

  it("score is NaN without enough history", () => {
    expect(momentumScore(series("X", 0.01, 1, 0.01, 50).closes)).toBeNaN();
  });

  it("basket return: long gains, short gains when price falls", () => {
    const basket = {
      longs: [{ symbol: "A", price: 100, score: 1, weight: 0.5 }],
      shorts: [{ symbol: "B", price: 100, score: -1, weight: 0.5 }],
    };
    expect(basketReturn(basket, new Map([["A", 110], ["B", 90]]))).toBeCloseTo(0.1);
  });

  it("week starts on Monday 00:00 UTC", () => {
    expect(weekStart(Date.UTC(2026, 10, 26, 15)).toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(weekStart(Date.UTC(2026, 10, 23, 0, 1)).toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });
});
