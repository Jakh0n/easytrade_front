/** @jest-environment node */
import { computePositionSizing } from "../services/risk.service";

describe("computePositionSizing", () => {
  it("sizes the position from the risk amount and stop distance", () => {
    const result = computePositionSizing({
      currentPrice: 100,
      stopLoss: 98,
      capital: 100,
      riskPercent: 2,
      marketType: "futures",
    });

    // Risk $2, stop distance $2 → 1 unit, $100 notional.
    expect(result.positionSize).toBeCloseTo(1);
    expect(result.riskAmount).toBeCloseTo(2);
    expect(result.notional).toBeCloseTo(100);
  });

  it("caps a spot position at the available capital", () => {
    const result = computePositionSizing({
      currentPrice: 100,
      stopLoss: 99.5,
      capital: 100,
      riskPercent: 2,
      marketType: "spot",
    });

    expect(result.notional).toBeLessThanOrEqual(100);
    expect(result.positionSize).toBeCloseTo(1);
    // Effective risk scales down with the cap: 1 unit * $0.5 stop distance.
    expect(result.riskAmount).toBeCloseTo(0.5);
    expect(result.warning).toBeDefined();
  });

  it("returns futures leverage guidance with a liquidation buffer", () => {
    const result = computePositionSizing({
      currentPrice: 100,
      stopLoss: 98,
      capital: 100,
      riskPercent: 2,
      marketType: "futures",
    });

    // 2% stop → max safe leverage = floor(1 / (3 * 0.02)) = 16, capped at 5.
    expect(result.futures?.maxSafeLeverage).toBe(5);
    expect(result.futures?.suggestedLeverage).toBe(3);
    expect(result.futures?.requiredMargin).toBeCloseTo(100 / 3);
  });

  it("keeps leverage at 1x when the stop is wide", () => {
    const result = computePositionSizing({
      currentPrice: 100,
      stopLoss: 60,
      capital: 100,
      riskPercent: 2,
      marketType: "futures",
    });

    // 40% stop → raw max < 1, clamped to 1x.
    expect(result.futures?.maxSafeLeverage).toBe(1);
    expect(result.futures?.suggestedLeverage).toBe(1);
  });

  it("omits futures guidance for spot", () => {
    const result = computePositionSizing({
      currentPrice: 100,
      stopLoss: 98,
      capital: 1000,
      riskPercent: 2,
      marketType: "spot",
    });

    expect(result.futures).toBeUndefined();
  });
});
