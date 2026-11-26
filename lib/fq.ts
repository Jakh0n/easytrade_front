import type { FqVerdict, SignalStatus, StrategyId, TradeSide } from "@/lib/api";

export function pairLabel(symbol: string): string {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

export function pctChange(from: number, to: number): number {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

export function signed(value: number, digits = 2, suffix = "%"): string {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}${suffix}`;
}

export function sideText(side: TradeSide): string {
  return side === "long" ? "LONG" : side === "short" ? "SHORT" : "—";
}

export const VERDICT_LABEL: Record<FqVerdict, string> = {
  enter: "Kirish",
  wait: "Kutish",
  avoid: "Kirmaslik",
};

export const STATUS_META: Record<
  SignalStatus,
  { label: string; tone: "long" | "short" | "warn" | "muted" }
> = {
  pending: { label: "Limit kutilmoqda", tone: "muted" },
  cancelled: { label: "Bekor", tone: "muted" },
  open: { label: "Ochiq", tone: "warn" },
  tp1: { label: "TP1 ✓ · BE", tone: "long" },
  tp2: { label: "TP2", tone: "long" },
  be: { label: "BE", tone: "muted" },
  sl: { label: "Stop", tone: "short" },
  exit: { label: "Flip · yopildi", tone: "muted" },
  expired: { label: "Muddati o'tdi", tone: "muted" },
};

export const STRATEGY_LABEL: Record<StrategyId, string> = {
  fq_15m: "FQ 15M",
  fq_v3: "Swing 1H",
  fq_4h: "Swing 4H",
  smc_4h: "SMC 4H",
  st_day: "Day 15M",
};

export const TONE_CLASS = {
  long: "bg-long/12 text-long ring-long/25",
  short: "bg-short/12 text-short ring-short/25",
  warn: "bg-warn/12 text-warn ring-warn/25",
  muted: "bg-muted text-muted-foreground ring-border",
} as const;

export interface PositionPlan {
  riskAmount: number;
  quantity: number;
  notional: number;
  leverage: number;
  stopPct: number;
}

/** Pine: qty = equity × risk% / stop masofasi. */
export function planPosition(
  capital: number,
  riskPercent: number,
  entry: number,
  stopLoss: number,
): PositionPlan | null {
  const distance = Math.abs(entry - stopLoss);
  if (!capital || !entry || distance <= 0) return null;
  const riskAmount = (capital * riskPercent) / 100;
  const quantity = riskAmount / distance;
  const notional = quantity * entry;
  return {
    riskAmount,
    quantity,
    notional,
    leverage: Math.max(1, Math.ceil(notional / capital)),
    stopPct: (distance / entry) * 100,
  };
}

export function timeAgo(value: string | number): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "hozir";
  if (minutes < 60) return `${minutes} daq oldin`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.round(hours / 24)} kun oldin`;
}
