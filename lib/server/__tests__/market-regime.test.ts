import { computeRegime, regimeAllows, regimeAt, type RegimeBar } from "../services/market-regime/engine";
import type { Candle } from "../types/index";

const H = 3_600_000;

function series(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    openTime: i * H,
    closeTime: (i + 1) * H - 1,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

const up = (n: number, start = 100) => Array.from({ length: n }, (_, i) => start * (1 + i * 0.01));
const down = (n: number, start = 100) => Array.from({ length: n }, (_, i) => start * (1 - i * 0.002));

describe("bozor rejimi", () => {
  it("BTC o'sib, altlar tushsa: btcUp, altUp emas, BTC.D yuqori", () => {
    const bars = computeRegime(series(up(60)), series(up(60)), [series(down(60)), series(down(60, 50))], 20);
    const last = bars.at(-1)!;
    expect(last.btcUp).toBe(true);
    expect(last.altUp).toBe(false);
    expect(last.domUp).toBe(true);
    expect(last.breadth).toBeNull(); // 5 tadan kam coin
  });

  it("isish davrida qiymatlar null va filtr bloklamaydi", () => {
    const bars = computeRegime(series(up(10)), series(up(10)), [series(up(10))], 20);
    expect(bars[5]!.btcUp).toBeNull();
    expect(regimeAllows("both", bars[5], "short", "SOLUSDT")).toBe(true);
  });

  it("qoidalar", () => {
    const bar: RegimeBar = { closeTime: 0, btcUp: true, ethUp: false, altUp: false, alt2Up: false, domUp: true, breadth: 0.3 };
    expect(regimeAllows("off", bar, "short", "SOLUSDT")).toBe(true);
    expect(regimeAllows("btc", bar, "long", "SOLUSDT")).toBe(true);
    expect(regimeAllows("btc", bar, "short", "SOLUSDT")).toBe(false);
    expect(regimeAllows("alt", bar, "long", "SOLUSDT")).toBe(false);
    expect(regimeAllows("both", bar, "long", "SOLUSDT")).toBe(false);
    expect(regimeAllows("both", bar, "short", "SOLUSDT")).toBe(false);
    // dom: alt LONG faqat alt season'da; BTC o'z trendi bo'yicha.
    expect(regimeAllows("dom", bar, "long", "SOLUSDT")).toBe(false);
    expect(regimeAllows("dom", bar, "short", "SOLUSDT")).toBe(true);
    expect(regimeAllows("dom", bar, "long", "BTCUSDT")).toBe(true);
    expect(regimeAllows("dom", bar, "long", "ETHUSDT")).toBe(false);
    expect(regimeAllows("breadth", bar, "short", "SOLUSDT")).toBe(true);
    // veto: aralash rejimda hammasi ruxsat.
    expect(regimeAllows("veto", bar, "long", "SOLUSDT")).toBe(true);
    expect(regimeAllows("veto", bar, "short", "SOLUSDT")).toBe(true);
  });

  it("regimeAt — vaqtgacha yopilgan oxirgi qator (look-ahead yo'q)", () => {
    const bars = computeRegime(series(up(30)), series(up(30)), [series(up(30))], 5);
    expect(regimeAt(bars, 10 * H - 1)!.closeTime).toBe(10 * H - 1);
    expect(regimeAt(bars, 10 * H + 5)!.closeTime).toBe(10 * H - 1);
    expect(regimeAt(bars, 0)).toBeNull();
  });
});
