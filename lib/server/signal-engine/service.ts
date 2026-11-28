import { env } from "../config/env";
import { EngineSignal, type EngineSignalDoc } from "../models/EngineSignal";
import { isTelegramConfigured } from "../services/telegram.service";
import { ENGINE_CONFIG, STRATEGY_LABELS, type StrategyName } from "./config";
import { breakdown, type StatsBreakdown, type TradeRow } from "./stats";

export function docToRow(doc: EngineSignalDoc): TradeRow {
  return {
    strategies: doc.strategies as StrategyName[],
    primaryStrategy: doc.primaryStrategy as StrategyName,
    regime: doc.regime,
    grade: doc.grade,
    kind: doc.kind,
    status: doc.status,
    resultR: doc.resultR ?? null,
    netR: doc.netR ?? null,
    createdAt: doc.createdAt.getTime(),
    filledAt: doc.filledAt?.getTime() ?? null,
    tp1At: doc.tp1At?.getTime() ?? null,
    closedAt: doc.closedAt?.getTime() ?? null,
  };
}

export interface EngineStatsResponse {
  days: number;
  stats: StatsBreakdown;
  /** Non-sent decisions per primary strategy: how often anti-late / R:R / conflicts / cap filtered. */
  filtered: Record<string, Record<string, number>>;
  watches: { total: number; upgraded: number };
  strategies: { id: StrategyName; label: string; enabled: boolean }[];
  telegram: { configured: boolean; enabled: boolean };
}

export async function getEngineStats(days: number): Promise<EngineStatsResponse> {
  const since = new Date(Date.now() - days * 86_400_000);
  const docs = await EngineSignal.find({ createdAt: { $gte: since } }).lean<EngineSignalDoc[]>();
  const sent = docs.filter((d) => d.sent);

  const filtered: Record<string, Record<string, number>> = {};
  for (const d of docs) {
    if (d.sent) continue;
    const bucket = (filtered[d.primaryStrategy] ??= {});
    bucket[d.decision] = (bucket[d.decision] ?? 0) + 1;
  }
  const watches = sent.filter((d) => d.kind === "watch");

  return {
    days,
    stats: breakdown(sent.map(docToRow)),
    filtered,
    watches: { total: watches.length, upgraded: watches.filter((d) => d.status === "upgraded").length },
    strategies: (Object.keys(STRATEGY_LABELS) as StrategyName[]).map((id) => ({
      id,
      label: STRATEGY_LABELS[id],
      enabled: ENGINE_CONFIG.strategies[id].enabled,
    })),
    telegram: { configured: isTelegramConfigured(), enabled: env.ENGINE_TELEGRAM_ENABLED },
  };
}

export interface EngineSignalRecord {
  id: string;
  symbol: string;
  direction: string;
  kind: string;
  regime: string;
  strategies: StrategyName[];
  grade: string;
  confidence: number;
  decision: string;
  note: string | null;
  status: string;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  netR: number | null;
  mfeR: number;
  maeR: number;
  reasons: string[];
  createdAt: string;
  closedAt: string | null;
  telegramSent: boolean;
}

export async function getEngineSignals(limit: number, includeFiltered: boolean): Promise<EngineSignalRecord[]> {
  const docs = await EngineSignal.find(includeFiltered ? {} : { sent: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<EngineSignalDoc[]>();
  return docs.map((d) => ({
    id: String(d._id),
    symbol: d.symbol,
    direction: d.direction,
    kind: d.kind,
    regime: d.regime,
    strategies: d.strategies as StrategyName[],
    grade: d.grade,
    confidence: d.confidence ?? 0,
    decision: d.decision,
    note: d.note ?? null,
    status: d.status,
    entryZoneLow: d.entryZoneLow ?? 0,
    entryZoneHigh: d.entryZoneHigh ?? 0,
    stopLoss: d.stopLoss ?? null,
    tp1: d.tp1 ?? null,
    tp2: d.tp2 ?? null,
    netR: d.netR ?? null,
    mfeR: d.mfeR ?? 0,
    maeR: d.maeR ?? 0,
    reasons: d.reasons ?? [],
    createdAt: d.createdAt.toISOString(),
    closedAt: d.closedAt ? d.closedAt.toISOString() : null,
    telegramSent: d.telegramMessageId != null,
  }));
}
