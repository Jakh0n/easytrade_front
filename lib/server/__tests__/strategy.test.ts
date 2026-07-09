/** @jest-environment node */
import { clampEntryZoneToMinRr } from "../services/strategy.service";

// Screenshot regression case: support 0.002239, ATR 0.000397 → the raw zone
// top (support + ATR) only offered ~1:1 R:R against SL/TP.
const LONG_LEVELS = {
  stopLoss: 0.00204,
  takeProfit: 0.0032325,
  rrNow: 2.5,
  rrIdeal: 2,
};

function rrAt(entry: number, side: "long" | "short"): number {
  const { stopLoss, takeProfit } = LONG_LEVELS;
  return side === "long"
    ? (takeProfit - entry) / (entry - stopLoss)
    : (entry - takeProfit) / (stopLoss - entry);
}

describe("clampEntryZoneToMinRr", () => {
  it("shrinks a long zone so the top edge still meets the minimum R:R", () => {
    const rawZone: [number, number] = [0.002239, 0.002636];

    const clamped = clampEntryZoneToMinRr(rawZone, LONG_LEVELS, "long", 1.5);

    expect(clamped[0]).toBeCloseTo(rawZone[0], 10);
    expect(clamped[1]).toBeLessThan(rawZone[1]);
    expect(rrAt(clamped[1], "long")).toBeGreaterThanOrEqual(1.5 - 1e-9);
  });

  it("leaves a zone untouched when every entry already satisfies the R:R", () => {
    const rawZone: [number, number] = [0.002239, 0.0023];

    const clamped = clampEntryZoneToMinRr(rawZone, LONG_LEVELS, "long", 1.5);

    expect(clamped).toEqual(rawZone);
  });

  it("raises the bottom edge of a short zone", () => {
    const shortLevels = {
      stopLoss: 110,
      takeProfit: 90,
      rrNow: 2,
      rrIdeal: 2,
    };
    const rawZone: [number, number] = [92, 105];

    const clamped = clampEntryZoneToMinRr(rawZone, shortLevels, "short", 2);

    expect(clamped[1]).toBeCloseTo(105, 10);
    expect(clamped[0]).toBeGreaterThan(92);
    const rr = (clamped[0] - 90) / (110 - clamped[0]);
    expect(rr).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  it("passes through degenerate levels (rrIdeal = 0)", () => {
    const rawZone: [number, number] = [1, 2];
    const degenerate = { stopLoss: 2, takeProfit: 1.5, rrNow: 0, rrIdeal: 0 };

    expect(
      clampEntryZoneToMinRr(rawZone, degenerate, "long", 1.5),
    ).toEqual(rawZone);
  });
});
