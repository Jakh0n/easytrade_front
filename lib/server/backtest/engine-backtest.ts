/**
 * Engine v2 backtest — replays history through the SAME code path as live:
 *   evaluateSymbol → decide → applyDecisions (book) → advanceLifecycle
 * The only difference is the data provider: at each 15m close `t` the snapshot holds
 * candles with closeTime < t (closed only) and OI / funding known at t — no look-ahead.
 * Lifecycle outcomes are simulated on the 5m candles AFTER t.
 */
import { SignalBook, applyDecisions } from "../signal-engine/book";
import type { EngineConfig } from "../signal-engine/config";
import { advanceLifecycle, initialState, isFinal, netR, type TradePlan, type TradeState } from "../signal-engine/lifecycle";
import { decide, evaluateSymbol } from "../signal-engine/pipeline";
import type { TradeRow } from "../signal-engine/stats";
import type { BookEntry, Decision, MarketData, OiPoint } from "../signal-engine/types";
import type { Candle } from "../types/index";
import type { SymbolHistory } from "./engine-data";

const M15 = 900_000;
const M5 = 300_000;

/** Index of the first element with key ≥ value (arrays ascending). */
function lowerBound<T>(arr: T[], value: number, key: (x: T) => number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]!) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Closed candles at time t: closeTime < t, last `count`. */
function closedAt(candles: Candle[], t: number, count: number): Candle[] {
  const end = lowerBound(candles, t, (c) => c.closeTime + 1);
  return candles.slice(Math.max(0, end - count), end);
}

function quoteVolume24h(c1h: Candle[]): number {
  return c1h.slice(-24).reduce((sum, c) => sum + c.close * c.volume, 0);
}

export function snapshotAt(h: SymbolHistory, btc1hAll: Candle[], t: number, cfg: EngineConfig): MarketData | null {
  const H = cfg.history;
  const c15m = closedAt(h.c15m, t, H["15m"]);
  const c5m = closedAt(h.c5m, t, H["5m"]);
  if (c15m.length < 120 || !c5m.length) return null;
  const c1h = closedAt(h.c1h, t, H["1h"]);
  const oiEnd = lowerBound(h.oi, t + 1, (p) => p.time);
  const oi: OiPoint[] = h.oi.slice(lowerBound(h.oi, t - 25 * 3_600_000, (p) => p.time), oiEnd);
  const fEnd = lowerBound(h.funding, t + 1, (p) => p.time);
  return {
    symbol: h.symbol,
    now: t,
    price: c5m.at(-1)!.close,
    c4h: closedAt(h.c4h, t, H["4h"]),
    c1h,
    c15m,
    c5m,
    oi,
    funding: fEnd > 0 ? h.funding[fEnd - 1]!.rate : null,
    volume24hUsd: quoteVolume24h(c1h),
    btc1h: closedAt(btc1hAll, t, H["1h"]),
  };
}

export interface BacktestSignal extends TradeRow {
  symbol: string;
  direction: string;
  confidence: number;
  mfeR: number;
  maeR: number;
  features: Record<string, unknown>;
}

export interface EngineBacktestResult {
  trades: BacktestSignal[];
  decisions: Record<string, number>;
  regimeBars: Record<string, number>;
  steps: number;
}

export function runEngineBacktest(
  histories: SymbolHistory[],
  btc1h: Candle[],
  start: number,
  end: number,
  cfg: EngineConfig,
  onProgress?: (pct: number) => void,
): EngineBacktestResult {
  const book = new SignalBook(cfg);
  const trades: BacktestSignal[] = [];
  const decisionsCount: Record<string, number> = {};
  const regimeBars: Record<string, number> = {};
  /** book entry → when its simulated status changes (so book rules see live-like statuses). */
  const timeline = new Map<BookEntry, { state: TradeState }>();
  const rows = new Map<BookEntry, BacktestSignal>();
  let id = 0;
  let steps = 0;
  const first = Math.ceil(start / M15) * M15;
  const holdBars = Math.ceil((cfg.lifecycle.maxHoldHours * 3_600_000 + cfg.antiLate.expiryMin * 60_000) / M5) + 2;

  for (let t = first; t <= end; t += M15) {
    steps += 1;
    if (steps % 500 === 0) onProgress?.((t - first) / (end - first));

    // Statuses as they would be in the DB at time t.
    for (const [entry, { state }] of timeline) {
      if (state.filledAt !== null && state.filledAt <= t && entry.status === "pending") entry.status = "open";
      if (isFinal(state.status) && (state.closedAt ?? Infinity) <= t) {
        entry.status = state.status;
        timeline.delete(entry);
      }
    }
    if (steps % 96 === 0) book.prune(t);

    const evals = [];
    for (const h of histories) {
      const snap = snapshotAt(h, btc1h, t, cfg);
      if (!snap || snap.volume24hUsd < cfg.universe.minQuoteVolumeUsd) continue;
      const ev = evaluateSymbol(snap, cfg);
      regimeBars[ev.regime.regime] = (regimeBars[ev.regime.regime] ?? 0) + 1;
      evals.push(ev);
    }

    const decisions = decide(evals, book, t, cfg);
    const created = applyDecisions(book, decisions, () => String(++id));
    for (const d of decisions) decisionsCount[d.status] = (decisionsCount[d.status] ?? 0) + 1;

    for (const [d, entry] of created) {
      const trade = simulate(d, entry, histories, t, holdBars, cfg, timeline);
      trades.push(trade);
      rows.set(entry, trade);
    }
    // Confluence upgrades re-grade the original row (live updates the DB row the same way).
    for (const d of decisions) {
      const row = d.status === "upgrade" && d.target ? rows.get(d.target) : undefined;
      if (row) {
        row.strategies = [...d.group.strategies];
        row.grade = d.group.grade;
      }
    }
  }

  return { trades, decisions: decisionsCount, regimeBars, steps };
}

function simulate(
  d: Decision,
  entry: BookEntry,
  histories: SymbolHistory[],
  t: number,
  holdBars: number,
  cfg: EngineConfig,
  timeline: Map<BookEntry, { state: TradeState }>,
): BacktestSignal {
  const g = d.group;
  const p = g.primary;
  const base = {
    symbol: g.symbol,
    direction: g.direction,
    strategies: g.strategies,
    primaryStrategy: p.strategy,
    regime: g.regime,
    grade: g.grade,
    kind: g.kind,
    confidence: g.confidence,
    createdAt: t,
    features: g.factors,
  };
  if (g.kind === "watch" || p.stopLoss === null || p.tp1 === null || p.tp2 === null) {
    return { ...base, status: "watch", resultR: null, netR: null, filledAt: null, tp1At: null, closedAt: null, mfeR: 0, maeR: 0 };
  }

  const h = histories.find((x) => x.symbol === g.symbol)!;
  const plan: TradePlan = {
    direction: g.direction,
    entryZoneLow: p.entryZoneLow,
    entryZoneHigh: p.entryZoneHigh,
    stopLoss: p.stopLoss,
    tp1: p.tp1,
    tp2: p.tp2,
    createdAt: t,
    expiresAt: g.expiresAt,
    invalidation: p.invalidation,
  };
  const i5 = lowerBound(h.c5m, t, (c) => c.openTime);
  const future5m = h.c5m.slice(i5, i5 + holdBars);
  const invSource = p.invalidation?.timeframe === "1h" ? h.c1h : h.c15m;
  const iInv = lowerBound(invSource, t, (c) => c.openTime);
  const futureInv = invSource.slice(iInv, iInv + 200);
  const { state } = advanceLifecycle(plan, initialState(plan), future5m, futureInv, cfg);
  timeline.set(entry, { state });

  return {
    ...base,
    status: state.status,
    resultR: state.resultR,
    netR: isFinal(state.status) ? netR(state) : null,
    filledAt: state.filledAt,
    tp1At: state.tp1At,
    closedAt: state.closedAt,
    mfeR: state.mfeR,
    maeR: state.maeR,
  };
}
