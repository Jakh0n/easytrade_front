import { evaluateRules } from "../services/signal-checker/rules";
import type { MarketSnapshot, SideSnapshot } from "../services/signal-checker/types";

const emptySide: SideSnapshot = {
  zone: null,
  liquidity_sweep: false,
  sweep: null,
  choch_5m: false,
  bos_5m: false,
  next_liquidity: null,
  plan: null,
};

const goodLong: SideSnapshot = {
  zone: { type: "OB", timeframe: "15m", top: 101, bottom: 99 },
  liquidity_sweep: true,
  sweep: { timeframe: "15m", level: 98, extreme: 97, time: "2026-01-01T00:00:00.000Z" },
  choch_5m: true,
  bos_5m: false,
  next_liquidity: 110,
  plan: { entry: 100, stop_loss: 96.9, tp1: 103.1, tp2: 109.3, rr: 3 },
};

function snap(over: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    symbol: "BTCUSDT",
    time: "2026-01-01T00:00:00.000Z",
    close: 100,
    ema200_4h: 90,
    structure_4h: "HH_HL",
    atr_5m: 0.5,
    long: goodLong,
    short: emptySide,
    funding_rate_pct: 0.01,
    news_within_30min: false,
    trades_today: 0,
    consecutive_losses: 0,
    ...over,
  };
}

describe("signal checker rules", () => {
  it("gives LONG with plan levels when every check passes", () => {
    const r = evaluateRules(snap());
    expect(r.decision).toBe("LONG");
    expect(Object.values(r.checks).every(Boolean)).toBe(true);
    expect(r).toMatchObject({ entry: 100, stop_loss: 96.9, tp1: 103.1, tp2: 109.3, rr: 3, confidence: "high" });
  });

  it("refuses when the 4H structure contradicts the EMA side", () => {
    const r = evaluateRules(snap({ structure_4h: "LH_LL" }));
    expect(r.decision).toBe("NO_TRADE");
    expect(r.checks.trend).toBe(false);
    expect(r.entry).toBeNull();
  });

  it("requires a liquidity sweep before the zone", () => {
    const r = evaluateRules(snap({ long: { ...goodLong, liquidity_sweep: false, sweep: null } }));
    expect(r.decision).toBe("NO_TRADE");
    expect(r.checks.zone).toBe(false);
  });

  it("refuses R:R below 2", () => {
    const r = evaluateRules(snap({ long: { ...goodLong, plan: { ...goodLong.plan!, rr: 1.5 } } }));
    expect(r.decision).toBe("NO_TRADE");
    expect(r.checks.risk_reward).toBe(false);
  });

  it("blocks on news, missing news data and discipline limits", () => {
    expect(evaluateRules(snap({ news_within_30min: true })).decision).toBe("NO_TRADE");
    expect(evaluateRules(snap({ news_within_30min: null })).decision).toBe("NO_TRADE");
    expect(evaluateRules(snap({ trades_today: 3 })).checks.discipline).toBe(false);
    expect(evaluateRules(snap({ consecutive_losses: 2 })).checks.discipline).toBe(false);
  });

  it("only warns on extreme funding and lowers confidence", () => {
    const r = evaluateRules(snap({ funding_rate_pct: 0.08 }));
    expect(r.decision).toBe("LONG");
    expect(r.confidence).toBe("medium");
    expect(r.warnings[0]).toContain("0.08");
  });
});
