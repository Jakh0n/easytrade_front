/** @jest-environment node */
import {
  computeInvestOpportunityScore,
} from "../services/invest-screener.service";
import type { InvestVerdict } from "../types/index";

describe("computeInvestOpportunityScore", () => {
  it("ranks accumulate setups above dca_wait", () => {
    const accumulate = computeInvestOpportunityScore({
      score: 72,
      verdict: "accumulate" as InvestVerdict,
      drawdownFromHigh: 20,
      trend: "bullish",
      topTargetUpside: 30,
    });
    const wait = computeInvestOpportunityScore({
      score: 72,
      verdict: "dca_wait" as InvestVerdict,
      drawdownFromHigh: 20,
      trend: "bullish",
      topTargetUpside: 30,
    });

    expect(accumulate).toBeGreaterThan(wait);
  });

  it("rewards a healthy discount off the 52w high", () => {
    const discounted = computeInvestOpportunityScore({
      score: 60,
      verdict: "dca_wait",
      drawdownFromHigh: 25,
      trend: "neutral",
      topTargetUpside: 10,
    });
    const nearAth = computeInvestOpportunityScore({
      score: 60,
      verdict: "dca_wait",
      drawdownFromHigh: 3,
      trend: "neutral",
      topTargetUpside: 10,
    });

    expect(discounted).toBeGreaterThan(nearAth);
  });
});
