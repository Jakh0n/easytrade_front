function priceDigits(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100) return 2;
  if (abs >= 1) return 4;
  return 6;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const digits = priceDigits(value);
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number, digits: number = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatNumber(value: number, digits: number = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Position size in base units. Coins differ by orders of magnitude — 0.04 BTC and
 * 12 400 DOGE both need to stay readable — so precision follows magnitude.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const digits = abs >= 1_000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;

  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
