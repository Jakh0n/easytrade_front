/** @jest-environment node */
import { computeConfluence } from "../services/mtf.service";

describe("computeConfluence", () => {
  it("scores high and stays aligned when all timeframes agree", () => {
    const result = computeConfluence("long", "bullish", "bullish", "1d");
    expect(result.aligned).toBe(true);
    expect(result.confluence).toBeGreaterThanOrEqual(90);
  });

  it("marks not-aligned and low score when HTF opposes a long", () => {
    const result = computeConfluence("long", "bullish", "bearish", "1d");
    expect(result.aligned).toBe(false);
    expect(result.confluence).toBeLessThan(50);
  });

  it("supports short trades against a bearish HTF", () => {
    const result = computeConfluence("short", "bearish", "bearish", "1d");
    expect(result.aligned).toBe(true);
    expect(result.confluence).toBeGreaterThanOrEqual(90);
  });
});
