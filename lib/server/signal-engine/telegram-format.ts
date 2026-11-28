import { STRATEGY_LABELS, type StrategyName } from "./config";
import type { LifecycleEvent } from "./lifecycle";
import { rewardRisk } from "./pipeline";
import type { GroupedSignal } from "./types";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fmtPrice(price: number): string {
  const digits = price >= 1000 ? 1 : price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 5 : 8;
  return Number(price.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits, useGrouping: false });
}

export function strategyList(names: StrategyName[]): string {
  return names.map((n) => STRATEGY_LABELS[n]).join(" + ");
}

/**
 * 🟢 LONG — SOLUSDT | Grade: A
 * Strategies: Trend Pullback + Funding Squeeze + Pre-Pump
 * Entry zone: 182.40 – 183.10
 * ...
 */
export function formatEntry(g: GroupedSignal): string {
  const p = g.primary;
  const long = g.direction === "long";
  const validMin = Math.max(1, Math.round((g.expiresAt - g.createdAt) / 60_000));
  const rr = rewardRisk(p);
  return [
    `${long ? "🟢 LONG" : "🔴 SHORT"} — <b>${esc(g.symbol)}</b> | Grade: <b>${g.grade}</b>`,
    `Strategies: ${esc(strategyList(g.strategies))}`,
    `Entry zone: <code>${fmtPrice(p.entryZoneLow)}</code> – <code>${fmtPrice(p.entryZoneHigh)}</code>`,
    `Stop: <code>${fmtPrice(p.stopLoss!)}</code>`,
    `TP1: <code>${fmtPrice(p.tp1!)}</code> | TP2: <code>${fmtPrice(p.tp2!)}</code>`,
    `R:R ≈ 1:${rr.toFixed(1)}`,
    `Valid for: ${validMin} min`,
    `Reasons: ${esc(g.reasons.slice(0, 6).join(", "))}`,
    `<i>${g.regime} · confidence ${g.confidence}</i>`,
  ].join("\n");
}

export function formatWatch(g: GroupedSignal): string {
  const long = g.direction === "long";
  return [
    `⚠️ WATCH — <b>${esc(g.symbol)}</b> (possible ${long ? "pump" : "dump"})`,
    esc(g.reasons.join(" + ")),
    `Range: <code>${fmtPrice(g.primary.entryZoneLow)}</code> – <code>${fmtPrice(g.primary.entryZoneHigh)}</code>`,
    "No entry yet — wait for breakout confirmation.",
  ].join("\n");
}

export function formatGroup(g: GroupedSignal): string {
  return g.kind === "watch" ? formatWatch(g) : formatEntry(g);
}

export function formatUpgrade(g: GroupedSignal, added: StrategyName[]): string {
  return [
    `⬆️ <b>Confluence upgrade → Grade ${g.grade}</b>`,
    `+ ${esc(strategyList(added))}`,
    `Strategies: ${esc(strategyList(g.strategies))}`,
  ].join("\n");
}

const UPDATE_TEXT: Partial<Record<LifecycleEvent, (r: number | null) => string>> = {
  tp1: () => "✅ <b>TP1 hit</b> — 50% closed, stop → breakeven",
  tp2: (r) => `🎯 <b>TP2 hit</b> — trade closed, ${r !== null ? `+${r.toFixed(2)}R` : ""}`,
  be: (r) => `⚖️ <b>Closed at breakeven</b> — ${r !== null ? `+${r.toFixed(2)}R` : ""}`,
  sl: () => "🛑 <b>SL hit</b> — −1R",
  expired: () => "⌛ <b>EXPIRED</b> — entry zone not filled",
  invalidated: () => "❌ <b>INVALIDATED</b> — setup broke before entry",
  timeout: (r) => `⏱ <b>Closed (max hold time)</b> — ${r !== null ? `${r >= 0 ? "+" : ""}${r.toFixed(2)}R` : ""}`,
};

export function formatUpdate(event: LifecycleEvent, symbol: string, direction: string, resultR: number | null): string | null {
  const build = UPDATE_TEXT[event];
  if (!build) return null;
  return `${build(resultR)}\n<i>${direction === "long" ? "LONG" : "SHORT"} · ${esc(symbol)}</i>`;
}
