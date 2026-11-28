/**
 * Per-strategy statistics — one pure summary used by the website and the backtest report.
 * A confluence signal counts toward EVERY strategy that agreed on it (attribution by participation),
 * plus a "primary" view where only the highest-confidence strategy is credited.
 */
import type { StrategyName } from "./config";

export interface TradeRow {
  strategies: StrategyName[];
  primaryStrategy: StrategyName;
  regime: string;
  grade: string;
  kind: string;
  status: string;
  resultR: number | null;
  netR: number | null;
  createdAt: number;
  filledAt: number | null;
  tp1At: number | null;
  closedAt: number | null;
}

export interface StrategySummary {
  signals: number;
  filled: number;
  closed: number;
  open: number;
  expired: number;
  invalidated: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  totalR: number;
  profitFactor: number;
  maxDrawdownR: number;
  avgMinutesToTp1: number | null;
}

const FINAL_FILLED = new Set(["tp2", "be", "sl", "timeout"]);

export function summarize(rows: TradeRow[]): StrategySummary {
  const filled = rows.filter((r) => r.filledAt !== null);
  const closed = filled.filter((r) => FINAL_FILLED.has(r.status) && r.netR !== null).sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
  const results = closed.map((r) => r.netR!);
  const wins = results.filter((r) => r > 0).length;
  const gains = results.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const pains = results.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  const totalR = gains + pains;

  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const r of results) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }

  const tpTimes = filled.filter((r) => r.tp1At !== null).map((r) => (r.tp1At! - r.filledAt!) / 60_000);

  return {
    signals: rows.length,
    filled: filled.length,
    closed: closed.length,
    open: rows.filter((r) => ["pending", "open", "tp1"].includes(r.status)).length,
    expired: rows.filter((r) => r.status === "expired").length,
    invalidated: rows.filter((r) => r.status === "invalidated").length,
    wins,
    losses: closed.length - wins,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    avgR: closed.length ? totalR / closed.length : 0,
    totalR,
    profitFactor: pains < 0 ? gains / -pains : gains > 0 ? Infinity : 0,
    maxDrawdownR: maxDD,
    avgMinutesToTp1: tpTimes.length ? tpTimes.reduce((a, b) => a + b, 0) / tpTimes.length : null,
  };
}

export interface StatsBreakdown {
  overall: StrategySummary;
  byStrategy: Record<string, StrategySummary>;
  byPrimaryStrategy: Record<string, StrategySummary>;
  byStrategyRegime: Record<string, Record<string, StrategySummary>>;
  byGrade: Record<string, StrategySummary>;
}

function groupBy(rows: TradeRow[], keys: (r: TradeRow) => string[]): Record<string, TradeRow[]> {
  const out: Record<string, TradeRow[]> = {};
  for (const r of rows) for (const k of keys(r)) (out[k] ??= []).push(r);
  return out;
}

const mapValues = <T, U>(obj: Record<string, T>, fn: (v: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));

/** Only ENTRY rows are trades; WATCH rows are excluded from performance numbers. */
export function breakdown(allRows: TradeRow[]): StatsBreakdown {
  const rows = allRows.filter((r) => r.kind === "entry");
  return {
    overall: summarize(rows),
    byStrategy: mapValues(groupBy(rows, (r) => r.strategies), summarize),
    byPrimaryStrategy: mapValues(groupBy(rows, (r) => [r.primaryStrategy]), summarize),
    byStrategyRegime: mapValues(groupBy(rows, (r) => r.strategies), (list) => mapValues(groupBy(list, (r) => [r.regime]), summarize)),
    byGrade: mapValues(groupBy(rows, (r) => [r.grade]), summarize),
  };
}
