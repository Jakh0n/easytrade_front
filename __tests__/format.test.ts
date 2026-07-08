import { formatNumber, formatPercent, formatPrice, formatUsd } from "@/lib/format";

describe("format helpers", () => {
  it("formats prices with adaptive precision", () => {
    expect(formatPrice(60000)).toBe("$60,000.00");
    expect(formatPrice(0.00012345)).toBe("$0.000123");
  });

  it("formats USD with two decimals", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });

  it("formats percentages", () => {
    expect(formatPercent(42.857)).toBe("42.9%");
  });

  it("returns an em dash for non-finite values", () => {
    expect(formatNumber(Number.NaN)).toBe("—");
  });
});
