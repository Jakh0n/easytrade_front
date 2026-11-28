/**
 * Signal lifecycle on 5m candles — pure, shared by live updates and the backtest.
 *
 *   pending ──zone touched──▶ open ──TP1──▶ tp1 ──TP2──▶ tp2
 *      │                        │             └──BE───▶ be
 *      ├─expiry─▶ expired       ├──SL──▶ sl
 *      └─invalidation─▶ invalidated   (open/tp1 past maxHoldHours → timeout)
 *
 * Conservative intrabar rule: when SL and TP are both inside one candle, SL wins.
 */
import type { Candle } from "../types/index";
import type { EngineConfig } from "./config";
import type { Direction, Invalidation } from "./types";

export type TradeStatus = "pending" | "open" | "tp1" | "tp2" | "be" | "sl" | "expired" | "invalidated" | "timeout";
export type LifecycleEvent = Exclude<TradeStatus, "pending"> | "filled";

export interface TradePlan {
  direction: Direction;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  createdAt: number;
  expiresAt: number;
  invalidation: Invalidation | null;
}

export interface TradeState {
  status: TradeStatus;
  fillPrice: number | null;
  filledAt: number | null;
  tp1At: number | null;
  closedAt: number | null;
  /** Gross result in R (relative to the actual fill). */
  resultR: number | null;
  /** Round-trip cost in R for this trade (cost% × fill / risk). */
  costR: number | null;
  /** Max favorable / adverse excursion in R since fill. */
  mfeR: number;
  maeR: number;
  /** closeTime of the last processed 5m candle. */
  lastProcessed: number;
}

export function initialState(plan: TradePlan): TradeState {
  return {
    status: "pending",
    fillPrice: null,
    filledAt: null,
    tp1At: null,
    closedAt: null,
    resultR: null,
    costR: null,
    mfeR: 0,
    maeR: 0,
    lastProcessed: plan.createdAt,
  };
}

export const isFinal = (s: TradeStatus) => !["pending", "open", "tp1"].includes(s);

/**
 * Advances `state` through closed 5m candles after `state.lastProcessed`.
 * `invCandles` are closed candles of the invalidation timeframe (only used while pending).
 */
export function advanceLifecycle(
  plan: TradePlan,
  prev: TradeState,
  candles5m: Candle[],
  invCandles: Candle[],
  cfg: EngineConfig,
): { state: TradeState; events: LifecycleEvent[] } {
  const state: TradeState = { ...prev };
  const events: LifecycleEvent[] = [];
  if (isFinal(state.status)) return { state, events };

  const s = plan.direction === "long" ? 1 : -1;
  const L = cfg.lifecycle;
  const maxHoldMs = L.maxHoldHours * 3_600_000;
  const close = (status: TradeStatus, at: number, r: number) => {
    state.status = status;
    state.closedAt = at;
    state.resultR = r;
    events.push(status as LifecycleEvent);
  };

  for (const c of candles5m) {
    if (c.closeTime <= state.lastProcessed) continue;
    if (isFinal(state.status)) break;

    if (state.status === "pending") {
      if (c.openTime >= plan.expiresAt) {
        close("expired", plan.expiresAt, 0);
        break;
      }
      const touched = s === 1 ? c.low <= plan.entryZoneHigh : c.high >= plan.entryZoneLow;
      if (touched) {
        const limit = s === 1 ? plan.entryZoneHigh : plan.entryZoneLow;
        // Opened through the limit → filled at the open (better price), otherwise at the limit.
        state.fillPrice = s === 1 ? Math.min(limit, c.open) : Math.max(limit, c.open);
        state.filledAt = c.openTime;
        state.status = "open";
        const risk = s * (state.fillPrice - plan.stopLoss);
        state.costR = risk > 0 ? ((cfg.backtest.roundTripCostPct / 100) * state.fillPrice) / risk : null;
        events.push("filled");
      } else {
        const inv = plan.invalidation;
        const broken =
          inv &&
          invCandles.some(
            (x) => x.closeTime > state.lastProcessed && x.closeTime <= c.closeTime && s * (x.close - inv.level) < 0,
          );
        state.lastProcessed = c.closeTime;
        if (broken) {
          close("invalidated", c.closeTime, 0);
          break;
        }
        continue;
      }
    }

    const fill = state.fillPrice!;
    const risk = s * (fill - plan.stopLoss);
    if (!(risk > 0)) {
      close("sl", c.closeTime, -1);
      break;
    }
    const r = (price: number) => (s * (price - fill)) / risk;
    const favorable = s === 1 ? c.high : c.low;
    const adverse = s === 1 ? c.low : c.high;
    state.mfeR = Math.max(state.mfeR, r(favorable));
    state.maeR = Math.min(state.maeR, r(adverse));
    const tp1R = r(plan.tp1);
    const tp2R = r(plan.tp2);
    const pct = L.tp1ClosePct;

    if (state.status === "open") {
      if (s * (adverse - plan.stopLoss) <= 0) {
        close("sl", c.closeTime, -1);
        break;
      }
      if (s * (favorable - plan.tp1) >= 0) {
        state.status = "tp1";
        state.tp1At = c.closeTime;
        events.push("tp1");
        if (s * (favorable - plan.tp2) >= 0) {
          close("tp2", c.closeTime, pct * tp1R + (1 - pct) * tp2R);
          break;
        }
      }
    } else if (state.status === "tp1" && c.closeTime > state.tp1At!) {
      const be = fill + s * L.beOffsetR * risk;
      if (s * (adverse - be) <= 0) {
        close("be", c.closeTime, pct * tp1R + (1 - pct) * L.beOffsetR);
        break;
      }
      if (s * (favorable - plan.tp2) >= 0) {
        close("tp2", c.closeTime, pct * tp1R + (1 - pct) * tp2R);
        break;
      }
    }

    state.lastProcessed = c.closeTime;
    if (state.filledAt !== null && c.closeTime - state.filledAt >= maxHoldMs) {
      const openR = r(c.close);
      close("timeout", c.closeTime, state.status === "tp1" ? pct * tp1R + (1 - pct) * openR : openR);
      break;
    }
  }

  if (isFinal(state.status) && state.closedAt !== null) state.lastProcessed = Math.max(state.lastProcessed, state.closedAt);
  return { state, events };
}

/** Net R after costs (only meaningful for filled trades). */
export function netR(state: TradeState): number | null {
  if (state.resultR === null || state.filledAt === null) return null;
  return state.resultR - (state.costR ?? 0);
}
