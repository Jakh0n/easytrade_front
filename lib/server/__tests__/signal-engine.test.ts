import { SignalBook, applyDecisions } from "../signal-engine/book";
import { ENGINE_CONFIG, type EngineConfig } from "../signal-engine/config";
import { computeIndicators, resetIndicatorMemo } from "../signal-engine/indicators";
import { advanceLifecycle, initialState, type TradePlan } from "../signal-engine/lifecycle";
import { decide, lateReason, type SymbolEvaluation } from "../signal-engine/pipeline";
import { detectRegime } from "../signal-engine/regime";
import { breakoutRetest } from "../signal-engine/strategies/breakout-retest";
import { liquiditySweep } from "../signal-engine/strategies/liquidity-sweep";
import { summarize } from "../signal-engine/stats";
import type { MarketData, Signal, StrategyInput } from "../signal-engine/types";
import type { Candle } from "../types/index";

const M15 = 900_000;
const T0 = Date.UTC(2026, 5, 1);
const cfg: EngineConfig = ENGINE_CONFIG;

function bar(i: number, o: number, h: number, l: number, c: number, v = 100, step = M15): Candle {
  const openTime = T0 + i * step;
  return { openTime, closeTime: openTime + step - 1, open: o, high: h, low: l, close: c, volume: v, takerBuyVolume: v / 2 };
}

function flat(n: number, price: number, step: number, wiggle = 0.3, start = 0): Candle[] {
  return Array.from({ length: n }, (_, k) => {
    const c = price + (k % 2 ? wiggle : -wiggle);
    return bar(start + k, price, Math.max(price, c) + wiggle, Math.min(price, c) - wiggle, c, 100, step);
  });
}

function marketData(c15m: Candle[], extra: Partial<MarketData> = {}): MarketData {
  const now = c15m.at(-1)!.closeTime + 1;
  return {
    symbol: "TESTUSDT",
    now,
    price: c15m.at(-1)!.close,
    c4h: flat(260, 100, 4 * 3_600_000),
    c1h: flat(260, 100, 3_600_000),
    c15m,
    c5m: [],
    oi: [],
    funding: 0.0001,
    volume24hUsd: 50_000_000,
    btc1h: flat(260, 50_000, 3_600_000, 10),
    ...extra,
  };
}

function input(data: MarketData): StrategyInput {
  return { data, ind: computeIndicators(data, cfg), regime: "TREND", cfg };
}

function signal(over: Partial<Signal> = {}): Signal {
  return {
    symbol: "SOLUSDT",
    direction: "long",
    strategy: "trend_pullback",
    kind: "entry",
    entryZoneLow: 99,
    entryZoneHigh: 100,
    stopLoss: 97,
    tp1: 102,
    tp2: 105,
    confidence: 60,
    triggerTime: T0,
    expiresAt: T0 + 45 * 60_000,
    invalidation: null,
    reasons: ["test"],
    factors: {},
    ...over,
  };
}

function evaluation(signals: Signal[], price = 100, now = T0 + 60_000): SymbolEvaluation {
  return {
    symbol: signals[0]?.symbol ?? "SOLUSDT",
    now,
    price,
    atr15m: 1,
    regime: { regime: "TREND", adx: 30, atrRatio: 1, trendDir: 1 },
    ran: [],
    signals,
    common: {},
    errors: [],
  };
}

beforeEach(() => resetIndicatorMemo());

describe("regime", () => {
  it("flat market is RANGE, steady trend is TREND", () => {
    const flatBars = flat(260, 100, 4 * 3_600_000);
    const data = marketData(flat(220, 100, M15), { c4h: flatBars });
    expect(detectRegime(flatBars, computeIndicators(data, cfg).h4, cfg).regime).toBe("RANGE");

    resetIndicatorMemo();
    const up = Array.from({ length: 260 }, (_, k) => bar(k, 100 + k, 101.5 + k, 99.5 + k, 101 + k, 100, 4 * 3_600_000));
    const d2 = marketData(flat(220, 100, M15), { c4h: up });
    expect(detectRegime(up, computeIndicators(d2, cfg).h4, cfg).regime).toBe("TREND");
  });

  it("ATR expansion above 1.8× average is HIGH_VOL", () => {
    const bars = flat(250, 100, 4 * 3_600_000, 0.3);
    for (let k = 0; k < 10; k++) bars.push(bar(250 + k, 100, 110, 90, k % 2 ? 105 : 95, 100, 4 * 3_600_000));
    const data = marketData(flat(220, 100, M15), { c4h: bars });
    expect(detectRegime(bars, computeIndicators(data, cfg).h4, cfg).regime).toBe("HIGH_VOL");
  });
});

describe("lifecycle", () => {
  const plan: TradePlan = {
    direction: "long",
    entryZoneLow: 99,
    entryZoneHigh: 100,
    stopLoss: 98,
    tp1: 102,
    tp2: 104,
    createdAt: T0,
    expiresAt: T0 + 45 * 60_000,
    invalidation: { timeframe: "15m", level: 98.5, description: "x" },
  };
  const m5 = (i: number, o: number, h: number, l: number, c: number) => bar(i, o, h, l, c, 100, 300_000);

  it("fills, hits TP1 then TP2 with partial close", () => {
    const { state, events } = advanceLifecycle(plan, initialState(plan), [m5(0, 101, 101, 99.8, 100.5), m5(1, 100.5, 102.2, 100.4, 102), m5(2, 102, 104.1, 101.9, 104)], [], cfg);
    expect(events).toEqual(["filled", "tp1", "tp2"]);
    expect(state.status).toBe("tp2");
    expect(state.fillPrice).toBe(100);
    expect(state.resultR).toBeCloseTo(0.5 * 1 + 0.5 * 2);
  });

  it("SL wins when stop and TP are in the same candle", () => {
    const { state } = advanceLifecycle(plan, initialState(plan), [m5(0, 100, 100, 99.5, 99.8), m5(1, 99.8, 103, 97, 100)], [], cfg);
    expect(state.status).toBe("sl");
    expect(state.resultR).toBe(-1);
  });

  it("expires when the zone is never touched", () => {
    const bars = Array.from({ length: 12 }, (_, k) => m5(k, 101, 101.5, 100.5, 101));
    const { state, events } = advanceLifecycle(plan, initialState(plan), bars, [], cfg);
    expect(events).toEqual(["expired"]);
    expect(state.status).toBe("expired");
  });

  it("is invalidated by a close beyond the level before fill", () => {
    // 15m candle closes at 98.4 (< 98.5) while 5m lows stay above the zone? use a gap: price never fills.
    const inv = [bar(0, 101, 101, 98.4, 98.4)];
    const fivem = [m5(0, 101, 101.2, 100.6, 101), m5(1, 101, 101.2, 100.6, 101), m5(2, 101, 101.2, 100.6, 101)];
    const { state } = advanceLifecycle(plan, initialState(plan), fivem, inv, cfg);
    expect(state.status).toBe("invalidated");
  });
});

describe("pipeline decisions", () => {
  it("one strategy → grade C, two agreeing → one merged grade B message", () => {
    const book = new SignalBook(cfg);
    const one = decide([evaluation([signal()])], book, T0 + 60_000, cfg);
    expect(one).toHaveLength(1);
    expect(one[0]!.status).toBe("send");
    expect(one[0]!.group.grade).toBe("C");

    const two = decide([evaluation([signal(), signal({ strategy: "funding_squeeze", confidence: 70 })])], new SignalBook(cfg), T0 + 60_000, cfg);
    expect(two).toHaveLength(1);
    expect(two[0]!.group.grade).toBe("B");
    expect(two[0]!.group.strategies).toEqual(["funding_squeeze", "trend_pullback"]);
    expect(two[0]!.group.confidence).toBe(80);
  });

  it("opposite directions on the same symbol suppress both", () => {
    const out = decide([evaluation([signal(), signal({ strategy: "liquidity_sweep", direction: "short", entryZoneLow: 100, entryZoneHigh: 101, stopLoss: 103, tp1: 98, tp2: 95 })])], new SignalBook(cfg), T0 + 60_000, cfg);
    expect(out.map((d) => d.status)).toEqual(["suppressed_conflict", "suppressed_conflict"]);
  });

  it("anti-late: price > 0.8 ATR past the zone → MISSED; past TP1 → MISSED", () => {
    expect(lateReason(signal(), 100.7, 1, cfg)).toBeNull();
    expect(lateReason(signal(), 100.9, 1, cfg)).toMatch(/ATR past/);
    expect(lateReason(signal({ tp1: 100.5 }), 100.6, 1, cfg)).toMatch(/TP1/);
    const out = decide([evaluation([signal()], 101.5)], new SignalBook(cfg), T0 + 60_000, cfg);
    expect(out[0]!.status).toBe("missed");
  });

  it("rejects R:R below the minimum", () => {
    const out = decide([evaluation([signal({ tp2: 102.5, tp1: 101 })])], new SignalBook(cfg), T0 + 60_000, cfg);
    expect(out[0]!.status).toBe("rejected_rr");
  });

  it("cooldown blocks the same setup; a new strategy within 30 min upgrades the group", () => {
    const book = new SignalBook(cfg);
    const first = decide([evaluation([signal()])], book, T0 + 60_000, cfg);
    applyDecisions(book, first, () => "a");

    const again = decide([evaluation([signal({ triggerTime: T0 + M15, expiresAt: T0 + M15 + 45 * 60_000 })], 100, T0 + M15 + 60_000)], book, T0 + M15 + 60_000, cfg);
    expect(again).toHaveLength(0);

    const joined = decide([evaluation([signal({ strategy: "breakout_retest", triggerTime: T0 + M15, expiresAt: T0 + M15 + 45 * 60_000 })], 100, T0 + M15 + 60_000)], book, T0 + M15 + 60_000, cfg);
    expect(joined[0]!.status).toBe("upgrade");
    expect(joined[0]!.group.grade).toBe("B");
    applyDecisions(book, joined, () => "b");
    expect(book.entries[0]!.strategies).toEqual(["trend_pullback", "breakout_retest"]);
  });

  it("missed signals are logged once, and sent if price comes back before expiry", () => {
    const book = new SignalBook(cfg);
    const missed = decide([evaluation([signal()], 101.5)], book, T0 + 60_000, cfg);
    applyDecisions(book, missed, () => "m");
    expect(decide([evaluation([signal()], 101.5, T0 + 120_000)], book, T0 + 120_000, cfg)).toHaveLength(0);
    const back = decide([evaluation([signal()], 100.2, T0 + 180_000)], book, T0 + 180_000, cfg);
    expect(back[0]!.status).toBe("send");
  });

  it("hourly cap keeps the highest grade", () => {
    const small = { ...cfg, cooldown: { ...cfg.cooldown, maxPerHour: 1 } };
    const a = evaluation([signal({ symbol: "AAAUSDT" })]);
    const b = evaluation([signal({ symbol: "BBBUSDT" }), signal({ symbol: "BBBUSDT", strategy: "funding_squeeze" })]);
    const out = decide([a, b], new SignalBook(small), T0 + 60_000, small);
    expect(out.find((d) => d.group.symbol === "BBBUSDT")!.status).toBe("send");
    expect(out.find((d) => d.group.symbol === "AAAUSDT")!.status).toBe("capped");
  });
});

describe("strategies", () => {
  it("breakout + retest fires only on the retest bar", () => {
    const c = flat(60, 100, M15, 0.3);
    c.push(bar(60, 100.2, 102, 100.1, 101.8, 400)); // breakout, 4× volume
    c.push(bar(61, 101.8, 102.2, 101.4, 102, 120));
    const atBreakout = breakoutRetest.evaluate("TESTUSDT", input(marketData(c.slice(0, 61))));
    expect(atBreakout).toBeNull();
    c.push(bar(62, 102, 102.1, 100.65, 101.5, 120)); // retest of 100.6 range high, holds
    const sig = breakoutRetest.evaluate("TESTUSDT", input(marketData(c)));
    expect(sig?.direction).toBe("long");
    expect(sig!.entryZoneLow).toBeCloseTo(100.6, 5);
    expect(sig!.stopLoss!).toBeLessThan(100.6);
  });

  it("liquidity sweep of the previous-day high → short", () => {
    // 1H history: previous UTC day high = 105.
    const day = 86_400_000;
    const now15Start = Math.floor((T0 + 3 * day) / day) * day + 4 * 3_600_000; // 04:00 UTC on day 3
    const h1: Candle[] = [];
    for (let t = now15Start - 10 * day; t < now15Start; t += 3_600_000) {
      const isPdh = t === now15Start - 4 * 3_600_000 - 12 * 3_600_000; // noon of previous day
      h1.push({ openTime: t, closeTime: t + 3_600_000 - 1, open: 100, high: isPdh ? 105 : 101, low: 99, close: 100, volume: 100 });
    }
    const c15: Candle[] = [];
    for (let k = 0; k < 60; k++) {
      const t = now15Start - (60 - k) * M15;
      c15.push({ openTime: t, closeTime: t + M15 - 1, open: 100, high: 100.5, low: 99.5, close: 100 + (k % 2 ? 0.2 : -0.2), volume: 100 });
    }
    const t1 = now15Start;
    c15.push({ openTime: t1, closeTime: t1 + M15 - 1, open: 104, high: 105.8, low: 103.9, close: 104.5, volume: 300 }); // sweep
    c15.push({ openTime: t1 + M15, closeTime: t1 + 2 * M15 - 1, open: 104.5, high: 104.6, low: 103.5, close: 103.7, volume: 150 }); // confirmation
    const data = marketData(c15, { c1h: h1 });
    const sig = liquiditySweep.evaluate("TESTUSDT", input(data));
    expect(sig?.direction).toBe("short");
    expect(sig!.stopLoss!).toBeGreaterThan(105.8);
    expect(sig!.reasons[0]).toMatch(/PDH/);
  });
});

describe("stats", () => {
  it("computes win rate, PF and drawdown on net R", () => {
    const row = (netR: number, i: number) => ({
      strategies: ["trend_pullback" as const],
      primaryStrategy: "trend_pullback" as const,
      regime: "TREND",
      grade: "C",
      kind: "entry",
      status: netR > 0 ? "tp2" : "sl",
      resultR: netR,
      netR,
      createdAt: i,
      filledAt: i,
      tp1At: netR > 0 ? i + 60_000 : null,
      closedAt: i + 1,
    });
    const s = summarize([row(1.5, 1), row(-1, 2), row(-1, 3), row(2, 4)]);
    expect(s.winRate).toBe(50);
    expect(s.profitFactor).toBeCloseTo(3.5 / 2);
    expect(s.maxDrawdownR).toBeCloseTo(2);
    expect(s.avgMinutesToTp1).toBe(1);
  });
});
