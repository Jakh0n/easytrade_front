import {
  MTF_CONFIG,
  buildLevels,
  bullishFvgs,
  evaluateMtf,
  findSweep,
  swingStructure,
  trend4h,
  type MtfInput,
} from "../services/mtf-strategy/engine";
import { makeCandles, type CandleShape } from "./helpers/candles";

const bar = (low: number, high: number, up = true): CandleShape => ({
  open: up ? low + (high - low) * 0.2 : low + (high - low) * 0.8,
  close: up ? low + (high - low) * 0.8 : low + (high - low) * 0.2,
  low,
  high,
});

/** Zigzag: har `leg` shamda yo'nalish almashadi, har to'lqin `step` ga siljiydi (HH+HL yoki LH+LL). */
function zigzag(count: number, start: number, step: number, leg = 5, amp = 4): CandleShape[] {
  const out: CandleShape[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    const up = Math.floor(i / leg) % 2 === 0;
    const delta = up ? amp / leg + step : -amp / leg + step;
    const next = price + delta;
    // Burilishda high/low teng bo'lmasin (fraktal qat'iy taqqoslaydi).
    const wick = up ? 0.2 : 0.1;
    out.push(bar(Math.min(price, next) - wick, Math.max(price, next) + wick, up));
    price = next;
  }
  return out;
}

const flat = (count: number, price: number) => makeCandles(Array.from({ length: count }, (_, i) => bar(price - 0.5, price + 0.5, i % 2 === 0)));

function input(over: Partial<MtfInput> = {}): MtfInput {
  return {
    symbol: "BTCUSDT",
    c4h: makeCandles(zigzag(260, 100, 0.3)),
    c1h: flat(200, 180),
    c5m: flat(200, 180),
    fundingRate: 0.0001,
    newsWithin30min: false,
    tradesToday: 0,
    consecutiveLosses: 0,
    ...over,
  };
}

describe("SMC MTF — 4H trend", () => {
  it("o'suvchi zigzag — HH_HL va LONG", () => {
    const c = makeCandles(zigzag(260, 100, 0.3));
    expect(swingStructure(c, MTF_CONFIG.pivot4h)).toBe("HH_HL");
    expect(trend4h(c).side).toBe("long");
  });

  it("tushuvchi zigzag — SHORT", () => {
    expect(trend4h(makeCandles(zigzag(260, 300, -0.3))).side).toBe("short");
  });

  it("range — trend yo'q", () => {
    expect(trend4h(flat(260, 100)).side).toBeNull();
  });

  it("200 shamdan kam — trend yo'q", () => {
    expect(trend4h(makeCandles(zigzag(150, 100, 0.3))).side).toBeNull();
  });
});

describe("SMC MTF — 1H zona va sweep", () => {
  it("bullish FVG topiladi, keyingi tegish qayd etiladi", () => {
    const shapes = [bar(99, 101), bar(99.5, 101), bar(101, 106), bar(104, 108), bar(105, 109), bar(102.5, 107, false)];
    const c = makeCandles(shapes);
    const atr = c.map(() => 2);
    const fvgs = bullishFvgs(c, atr, 0);
    const gap = fvgs.find((z) => z.low === 101 && z.high === 104);
    expect(gap).toBeDefined();
    expect(gap!.firstTouch).toBe(5);
  });

  it("close zona ostida yopilsa — FVG buzilgan (firstTouch = -1)", () => {
    const shapes = [bar(99, 101), bar(99.5, 101), bar(101, 106), bar(104, 108), bar(98, 105, false)];
    shapes[4] = { open: 104, high: 105, low: 98, close: 99 };
    const fvgs = bullishFvgs(makeCandles(shapes), shapes.map(() => 2), 0);
    expect(fvgs.find((z) => z.low === 101)!.firstTouch).toBe(-1);
  });

  it("swing low sweep: soya ostida, close ustida", () => {
    const shapes: CandleShape[] = [
      bar(105, 107), bar(104, 106), bar(103, 105), bar(100, 104, false), bar(102, 105), bar(103, 106), bar(104, 107),
      { open: 103, high: 104, low: 99, close: 102 }, // 100 dagi swing low sweep
    ];
    const s = findSweep(makeCandles(shapes), 0);
    expect(s).toEqual({ index: 7, level: 100, extreme: 99 });
  });

  it("close swing low ostida — sweep emas", () => {
    const shapes: CandleShape[] = [
      bar(105, 107), bar(104, 106), bar(103, 105), bar(100, 104, false), bar(102, 105), bar(103, 106), bar(104, 107),
      { open: 103, high: 104, low: 98, close: 99 },
    ];
    expect(findSweep(makeCandles(shapes), 0)).toBeNull();
  });
});

describe("SMC MTF — darajalar", () => {
  it("SL bufer = max(0.1%, 0.2×ATR), TP1 = 1R, TP2 likvidlikda", () => {
    const l = buildLevels(100, 98, 5, 108)!;
    expect(l.stopLoss).toBeCloseTo(97); // 0.2×5 = 1 > 0.098
    expect(l.tp1).toBeCloseTo(103);
    expect(l.tp2).toBe(108);
    expect(l.rr).toBeCloseTo(2.67);
  });

  it("likvidlik yo'q — TP2 = 3R, juda uzoq — 4R bilan cheklanadi", () => {
    expect(buildLevels(100, 98, 5, null)!.tp2).toBeCloseTo(109);
    expect(buildLevels(100, 98, 5, 200)!.tp2).toBeCloseTo(112);
  });

  it("SL kirishdan yuqori — null", () => {
    expect(buildLevels(100, 101, 0, null)).toBeNull();
  });
});

describe("SMC MTF — filtrlar va qaror", () => {
  it("yangilik — NO_TRADE", () => {
    const r = evaluateMtf(input({ newsWithin30min: true }));
    expect(r.decision).toBe("NO_TRADE");
    expect(r.checks.filters_ok).toBe(false);
  });

  it("kunlik limit — NO_TRADE", () => {
    expect(evaluateMtf(input({ tradesToday: 3 })).decision).toBe("NO_TRADE");
    expect(evaluateMtf(input({ consecutiveLosses: 2 })).decision).toBe("NO_TRADE");
  });

  it("yuqori funding — ogohlantirish", () => {
    expect(evaluateMtf(input({ fundingRate: 0.001 })).warnings).toContain("Funding yuqori: 0.1%");
  });

  it("4H range — trend bosqichida to'xtaydi", () => {
    const r = evaluateMtf(input({ c4h: flat(260, 100) }));
    expect(r.decision).toBe("NO_TRADE");
    expect(r.trend_4h).toBe("NONE");
    expect(r.checks.zone_1h).toBe(false);
  });

  it("trend bor, 1H tekis — zona yo'q, darajalar null", () => {
    const r = evaluateMtf(input());
    expect(r.trend_4h).toBe("LONG");
    expect(["NO_TRADE", "WAIT"]).toContain(r.decision);
    expect(r.entry).toBeNull();
  });
});
