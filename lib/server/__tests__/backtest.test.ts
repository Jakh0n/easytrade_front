/** @jest-environment node */
import {
  summarizeBacktest,
  type ClosedTrade,
} from "../services/backtest.service";

describe("summarizeBacktest", () => {
  it("computes win rate, avg R and expectancy", () => {
    const trades: ClosedTrade[] = [
      { strategy: "trend_pullback", rMultiple: 2, win: true },
      { strategy: "trend_pullback", rMultiple: -1, win: false },
      { strategy: "breakout_retest", rMultiple: 2, win: true },
      { strategy: "breakout_retest", rMultiple: -1, win: false },
    ];

    const summary = summarizeBacktest(trades);

    expect(summary.trades).toBe(4);
    expect(summary.wins).toBe(2);
    expect(summary.losses).toBe(2);
    expect(summary.winRate).toBe(50);
    expect(summary.avgR).toBeCloseTo(0.5);
    expect(summary.expectancy).toBeCloseTo(0.5);
    expect(summary.byStrategy).toHaveLength(2);
  });

  it("returns zeroed stats for no trades", () => {
    const summary = summarizeBacktest([]);
    expect(summary.trades).toBe(0);
    expect(summary.winRate).toBe(0);
    expect(summary.avgR).toBe(0);
  });
});
