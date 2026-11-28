/**
 * Live engine cycle (called every minute by cron-job.org → /api/engine/run):
 *
 *   for each symbol in universe:
 *     1. detect regime   2. run strategies for the regime   3. collect + group
 *     4. confluence grade   5. anti-late   6. dedup / cooldown / hourly cap
 *     7. Telegram + MongoDB
 *   then advance the lifecycle of every active signal (fill / TP / SL / expiry / invalidation)
 *
 * All decisions come from `pipeline.ts` + `book.ts` — the same code the backtest runs.
 */
import mongoose from "mongoose";
import { env } from "../config/env";
import { EngineSignal, type EngineSignalDoc } from "../models/EngineSignal";
import { getKlinesRange } from "../services/binance.service";
import { isTelegramConfigured, sendTelegramMessage } from "../services/telegram.service";
import { SignalBook, applyDecisions, rawKey } from "./book";
import { ENGINE_CONFIG, type EngineConfig, type StrategyName } from "./config";
import { loadLiveMarketData, loadUniverse } from "./data/live";
import { advanceLifecycle, isFinal, netR, type TradePlan, type TradeState } from "./lifecycle";
import { decide, evaluateSymbol } from "./pipeline";
import { formatGroup, formatUpdate, formatUpgrade } from "./telegram-format";
import type { BookEntry, Decision, Direction, Grade, Invalidation, SignalKind } from "./types";

export interface EngineRunResult {
  universe: number;
  evaluated: number;
  regimes: Record<string, number>;
  rawSignals: number;
  decisions: Record<string, number>;
  sent: number;
  telegram: boolean;
  updated: number;
  errors: string[];
  ranAt: string;
  tookMs: number;
}

export function engineTelegramActive(): boolean {
  return env.ENGINE_TELEGRAM_ENABLED && isTelegramConfigured();
}

let indexesSynced = false;

// ───────────── book hydration ─────────────

function toBookEntry(doc: EngineSignalDoc): BookEntry {
  return {
    id: String(doc._id),
    symbol: doc.symbol,
    direction: doc.direction as Direction,
    kind: doc.kind as SignalKind,
    strategies: doc.strategies as StrategyName[],
    grade: doc.grade as Grade,
    createdAt: doc.createdAt.getTime(),
    expiresAt: doc.expiresAt.getTime(),
    status: doc.status,
    telegramMessageId: doc.telegramMessageId,
  };
}

async function hydrateBook(cfg: EngineConfig, now: number): Promise<SignalBook> {
  const book = new SignalBook(cfg);
  const since = new Date(now - Math.max(cfg.cooldown.sameSetupHours, 8) * 3_600_000);
  const docs = await EngineSignal.find({
    $or: [{ createdAt: { $gte: since } }, { sent: true, status: { $in: ["pending", "open", "tp1", "watch"] as const } }],
  }).lean<EngineSignalDoc[]>();
  for (const doc of docs) {
    for (const key of doc.rawKeys ?? []) book.seen.set(key, doc.decision);
    if (doc.sent) book.entries.push(toBookEntry(doc));
  }
  return book;
}

// ───────────── persistence ─────────────

function docFromDecision(d: Decision, id: string | null): Record<string, unknown> {
  const g = d.group;
  const p = g.primary;
  const sent = d.status === "send";
  return {
    ...(id ? { _id: new mongoose.Types.ObjectId(id) } : {}),
    key: `${d.status}:${g.key}`,
    symbol: g.symbol,
    direction: g.direction,
    kind: g.kind,
    regime: g.regime,
    strategies: g.strategies,
    primaryStrategy: p.strategy,
    grade: g.grade,
    confidence: g.confidence,
    decision: d.status,
    note: d.note ?? null,
    sent,
    entryZoneLow: p.entryZoneLow,
    entryZoneHigh: p.entryZoneHigh,
    stopLoss: p.stopLoss,
    tp1: p.tp1,
    tp2: p.tp2,
    invalidation: p.invalidation,
    priceAtSignal: g.price,
    atr15m: g.atr15m,
    reasons: g.reasons,
    features: g.factors,
    components: g.components.map((c) => ({
      strategy: c.strategy,
      confidence: c.confidence,
      entryZoneLow: c.entryZoneLow,
      entryZoneHigh: c.entryZoneHigh,
      stopLoss: c.stopLoss,
      tp1: c.tp1,
      tp2: c.tp2,
      triggerTime: new Date(c.triggerTime),
      rawKey: rawKey(c),
      reasons: c.reasons,
    })),
    rawKeys: g.components.map(rawKey),
    createdAt: new Date(g.createdAt),
    expiresAt: new Date(g.expiresAt),
    status: sent ? (g.kind === "watch" ? "watch" : "pending") : d.status,
    lastProcessed: new Date(g.createdAt),
    parentId: d.target ? new mongoose.Types.ObjectId(d.target.id) : null,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

async function persistDecisions(decisions: Decision[], created: Map<Decision, BookEntry>, errors: string[]): Promise<number> {
  const telegram = engineTelegramActive();
  let sent = 0;

  for (const d of decisions) {
    try {
      if (d.status === "upgrade" && d.target) {
        const added = d.group.components.map((c) => c.strategy);
        const doc = await EngineSignal.findByIdAndUpdate(
          d.target.id,
          {
            $set: { strategies: d.group.strategies, grade: d.group.grade, "features.strategy_count": d.group.strategies.length },
            $push: { components: { $each: docFromDecision(d, null).components as unknown[] } },
            $addToSet: { rawKeys: { $each: d.group.components.map(rawKey) } },
          },
          { new: true },
        );
        if (doc?.telegramMessageId && telegram) {
          await sendTelegramMessage(formatUpgrade(d.group, added), { replyTo: doc.telegramMessageId });
        }
        continue;
      }

      const entry = created.get(d);
      await EngineSignal.create(docFromDecision(d, entry?.id ?? null));
      if (d.target?.kind === "watch" && d.status === "send") {
        await EngineSignal.updateOne({ _id: d.target.id }, { status: "upgraded" });
      }
      if (d.status !== "send") continue;
      sent += 1;
      if (!telegram) continue;
      const messageId = await sendTelegramMessage(formatGroup(d.group), {
        replyTo: d.target?.kind === "watch" ? d.target.telegramMessageId : null,
      });
      await EngineSignal.updateOne({ _id: entry!.id }, { telegramMessageId: messageId });
    } catch (error) {
      if (isDuplicateKey(error)) continue;
      errors.push(`persist ${d.group.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return sent;
}

// ───────────── lifecycle updates ─────────────

const TF_MS = { "1h": 3_600_000, "15m": 900_000 } as const;

export function planFromDoc(doc: EngineSignalDoc): TradePlan {
  return {
    direction: doc.direction as Direction,
    entryZoneLow: doc.entryZoneLow!,
    entryZoneHigh: doc.entryZoneHigh!,
    stopLoss: doc.stopLoss!,
    tp1: doc.tp1!,
    tp2: doc.tp2!,
    createdAt: doc.createdAt.getTime(),
    expiresAt: doc.expiresAt.getTime(),
    invalidation: (doc.invalidation as Invalidation | null) ?? null,
  };
}

function stateFromDoc(doc: EngineSignalDoc): TradeState {
  return {
    status: doc.status as TradeState["status"],
    fillPrice: doc.fillPrice ?? null,
    filledAt: doc.filledAt?.getTime() ?? null,
    tp1At: doc.tp1At?.getTime() ?? null,
    closedAt: doc.closedAt?.getTime() ?? null,
    resultR: doc.resultR ?? null,
    costR: doc.costR ?? null,
    mfeR: doc.mfeR ?? 0,
    maeR: doc.maeR ?? 0,
    lastProcessed: (doc.lastProcessed ?? doc.createdAt).getTime(),
  };
}

async function updateActive(cfg: EngineConfig, now: number, errors: string[]): Promise<number> {
  const telegram = engineTelegramActive();
  let updated = 0;

  // WATCH rows simply expire (no message — the spec's EXPIRED update is for entries).
  const expired = await EngineSignal.updateMany(
    { sent: true, status: "watch", expiresAt: { $lte: new Date(now) } },
    { status: "watch_expired" },
  );
  updated += expired.modifiedCount;

  const active = await EngineSignal.find({ sent: true, kind: "entry", status: { $in: ["pending", "open", "tp1"] } })
    .sort({ createdAt: 1 })
    .limit(cfg.lifecycle.maxUpdatesPerRun);

  for (const doc of active) {
    try {
      const plan = planFromDoc(doc);
      const prev = stateFromDoc(doc);
      const candles = (await getKlinesRange(doc.symbol, "5m", prev.lastProcessed + 1, now, "futures")).filter((c) => c.closeTime <= now);
      let inv: Awaited<ReturnType<typeof getKlinesRange>> = [];
      if (prev.status === "pending" && plan.invalidation) {
        const tf = plan.invalidation.timeframe;
        inv = (await getKlinesRange(doc.symbol, tf, prev.lastProcessed - TF_MS[tf], now, "futures")).filter((c) => c.closeTime <= now);
      }
      const { state, events } = advanceLifecycle(plan, prev, candles, inv, cfg);
      if (state.lastProcessed === prev.lastProcessed && !events.length) continue;

      await EngineSignal.updateOne(
        { _id: doc._id },
        {
          status: state.status,
          fillPrice: state.fillPrice,
          filledAt: state.filledAt ? new Date(state.filledAt) : null,
          tp1At: state.tp1At ? new Date(state.tp1At) : null,
          closedAt: state.closedAt ? new Date(state.closedAt) : null,
          resultR: state.resultR,
          netR: isFinal(state.status) ? netR(state) : null,
          costR: state.costR,
          mfeR: state.mfeR,
          maeR: state.maeR,
          hitTp1: state.tp1At !== null,
          lastProcessed: new Date(state.lastProcessed),
        },
      );
      updated += 1;

      if (telegram && doc.telegramMessageId) {
        for (const event of events) {
          const text = formatUpdate(event, doc.symbol, doc.direction, isFinal(state.status) ? state.resultR : null);
          if (text) await sendTelegramMessage(text, { replyTo: doc.telegramMessageId });
        }
      }
    } catch (error) {
      errors.push(`update ${doc.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return updated;
}

// ───────────── cycle ─────────────

export async function runEngineCycle(cfg: EngineConfig = ENGINE_CONFIG, now: number = Date.now()): Promise<EngineRunResult> {
  const started = Date.now();
  const errors: string[] = [];
  if (!indexesSynced) {
    indexesSynced = true;
    await EngineSignal.syncIndexes().catch((e: unknown) => errors.push(`indexes: ${e instanceof Error ? e.message : String(e)}`));
  }

  const universe = await loadUniverse(cfg);
  const { data, errors: dataErrors } = await loadLiveMarketData(universe, cfg, now);
  errors.push(...dataErrors);

  const evals = data.map((d) => evaluateSymbol(d, cfg));
  for (const ev of evals) errors.push(...ev.errors);

  const book = await hydrateBook(cfg, now);
  const decisions = decide(evals, book, now, cfg);
  const created = applyDecisions(book, decisions, () => new mongoose.Types.ObjectId().toString());
  const sent = await persistDecisions(decisions, created, errors);
  const updated = await updateActive(cfg, now, errors);

  const regimes: Record<string, number> = {};
  for (const ev of evals) regimes[ev.regime.regime] = (regimes[ev.regime.regime] ?? 0) + 1;
  const counts: Record<string, number> = {};
  for (const d of decisions) counts[d.status] = (counts[d.status] ?? 0) + 1;

  return {
    universe: universe.length,
    evaluated: evals.length,
    regimes,
    rawSignals: evals.reduce((n, ev) => n + ev.signals.length, 0),
    decisions: counts,
    sent,
    telegram: engineTelegramActive(),
    updated,
    errors,
    ranAt: new Date(now).toISOString(),
    tookMs: Date.now() - started,
  };
}
