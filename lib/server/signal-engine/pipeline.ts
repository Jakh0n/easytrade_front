/**
 * The engine's decision path — pure functions, shared by live and backtest:
 *
 *   evaluateSymbol:  regime → strategies allowed for the regime (OR: each runs independently,
 *                    a silent strategy never blocks another) → HIGH_VOL stop widening →
 *                    supporting-factor points
 *   decide:          cooldown → R:R check → opposite-direction suppression → confluence grading
 *                    (merge into one group) → anti-late → hourly cap
 */
import { STRATEGY_LABELS, type EngineConfig, type StrategyName } from "./config";
import { gradeFor, rawKey, type SignalBook } from "./book";
import { commonFactors, supportingFactors } from "./factors";
import { computeIndicators, last } from "./indicators";
import { detectRegime, strategiesFor, type RegimeInfo } from "./regime";
import { STRATEGIES } from "./strategies";
import { sign } from "./strategies/helpers";
import type { Decision, DecisionStatus, Direction, FactorValue, GroupedSignal, MarketData, Signal } from "./types";

export interface SymbolEvaluation {
  symbol: string;
  now: number;
  price: number;
  atr15m: number;
  regime: RegimeInfo;
  ran: StrategyName[];
  signals: Signal[];
  common: Record<string, FactorValue>;
  errors: string[];
}

function widenStops(sig: Signal, mult: number): Signal {
  if (sig.kind !== "entry" || sig.stopLoss === null || sig.tp1 === null || sig.tp2 === null) return sig;
  const mid = (sig.entryZoneLow + sig.entryZoneHigh) / 2;
  const scale = (x: number) => mid + (x - mid) * mult;
  return { ...sig, stopLoss: scale(sig.stopLoss), tp1: scale(sig.tp1), tp2: scale(sig.tp2) };
}

export function evaluateSymbol(data: MarketData, cfg: EngineConfig): SymbolEvaluation {
  const ind = computeIndicators(data, cfg);
  const regime = detectRegime(data.c4h, ind.h4, cfg);
  const ran = strategiesFor(regime.regime, cfg);
  const input = { data, ind, regime: regime.regime, cfg };
  const signals: Signal[] = [];
  const errors: string[] = [];

  for (const name of ran) {
    let sig: Signal | null = null;
    try {
      sig = STRATEGIES[name].evaluate(data.symbol, input);
    } catch (error) {
      errors.push(`${data.symbol} ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!sig) continue;
    if (regime.regime === "HIGH_VOL") sig = widenStops(sig, cfg.highVolStopMult);
    const support = supportingFactors(sig, data, ind, cfg);
    signals.push({
      ...sig,
      confidence: Math.min(100, sig.confidence + support.points),
      reasons: [...sig.reasons, ...support.reasons],
      factors: { ...sig.factors, ...support.factors },
    });
  }

  return {
    symbol: data.symbol,
    now: data.now,
    price: data.price,
    atr15m: last(ind.m15.atr),
    regime,
    ran,
    signals,
    common: commonFactors(data, ind, regime, cfg),
    errors,
  };
}

/** Round-trip cost of the trade expressed in R (fees + slippage vs stop distance). */
export function costInR(sig: Pick<Signal, "entryZoneLow" | "entryZoneHigh" | "stopLoss">, cfg: EngineConfig): number {
  if (sig.stopLoss === null) return NaN;
  const mid = (sig.entryZoneLow + sig.entryZoneHigh) / 2;
  const risk = Math.abs(mid - sig.stopLoss);
  return risk > 0 ? ((cfg.backtest.roundTripCostPct / 100) * mid) / risk : Infinity;
}

export function rewardRisk(sig: Pick<Signal, "entryZoneLow" | "entryZoneHigh" | "stopLoss" | "tp2">): number {
  if (sig.stopLoss === null || sig.tp2 === null) return NaN;
  const mid = (sig.entryZoneLow + sig.entryZoneHigh) / 2;
  const risk = Math.abs(mid - sig.stopLoss);
  return risk > 0 ? Math.abs(sig.tp2 - mid) / risk : NaN;
}

/** Anti-late: null = OK to send, otherwise the reason it is MISSED. */
export function lateReason(sig: Signal, price: number, atr15m: number, cfg: EngineConfig): string | null {
  if (sig.stopLoss === null || sig.tp1 === null) return null;
  const s = sign(sig.direction);
  const zoneEdge = s === 1 ? sig.entryZoneHigh : sig.entryZoneLow;
  const chase = s * (price - zoneEdge);
  if (chase > cfg.antiLate.maxChaseAtr * atr15m) {
    return `price ${(chase / atr15m).toFixed(2)} ATR past entry zone`;
  }
  if (s * (price - sig.tp1) >= 0) return "price already beyond TP1";
  if (s * (price - sig.stopLoss) <= 0) return "price already beyond stop";
  return null;
}

function buildGroup(ev: SymbolEvaluation, comps: Signal[], cfg: EngineConfig, extraStrategies: StrategyName[] = []): GroupedSignal {
  const sorted = [...comps].sort((a, b) => b.confidence - a.confidence);
  const primary = sorted[0]!;
  const strategies = [...new Set<StrategyName>([...extraStrategies, ...sorted.map((c) => c.strategy)])];
  const reasons = [...new Set(sorted.flatMap((c) => c.reasons))];
  const factors: Record<string, FactorValue> = { ...ev.common };
  for (const c of sorted) Object.assign(factors, c.factors);
  for (const name of Object.keys(STRATEGY_LABELS) as StrategyName[]) factors[`strat_${name}`] = strategies.includes(name);
  factors.strategy_count = strategies.length;
  factors.rr_tp2 = Number.isFinite(rewardRisk(primary)) ? Number(rewardRisk(primary).toFixed(3)) : null;
  return {
    key: `${ev.symbol}:${primary.direction}:${primary.kind}:${primary.strategy}:${primary.triggerTime}`,
    symbol: ev.symbol,
    direction: primary.direction,
    kind: primary.kind,
    regime: ev.regime.regime,
    strategies,
    grade: gradeFor(strategies.length, cfg),
    confidence: Math.min(100, primary.confidence + cfg.confluence.extraStrategyPts * (strategies.length - 1)),
    primary,
    components: sorted,
    createdAt: ev.now,
    expiresAt: primary.expiresAt,
    price: ev.price,
    atr15m: ev.atr15m,
    reasons,
    factors,
  };
}

const RETRYABLE = new Set(["missed", "capped"]);
const GRADE_ORDER = { A: 0, B: 1, C: 2 } as const;

export function decide(evals: SymbolEvaluation[], book: SignalBook, now: number, cfg: EngineConfig): Decision[] {
  const decisions: Decision[] = [];
  /** Decisions whose every component was already seen with a retryable status: emit only if they now succeed. */
  const quietIfFail = new Set<Decision>();

  const push = (d: Decision, allSeen: boolean) => {
    decisions.push(d);
    if (allSeen) quietIfFail.add(d);
  };

  for (const ev of evals) {
    const fresh = ev.signals.filter((sig) => {
      if (sig.expiresAt <= now) return false;
      const seen = book.seen.get(rawKey(sig));
      if (seen && !RETRYABLE.has(seen)) return false;
      if (book.inCooldown(ev.symbol, sig.strategy, sig.direction, sig.kind, now)) return false;
      return true;
    });
    const isSeen = (sig: Signal) => book.seen.has(rawKey(sig));

    // R:R check per raw entry.
    const entries: Signal[] = [];
    for (const sig of fresh.filter((x) => x.kind === "entry")) {
      const rr = rewardRisk(sig);
      const cost = costInR(sig, cfg);
      if (!(rr >= cfg.antiLate.minRR)) {
        push({ status: "rejected_rr", group: buildGroup(ev, [sig], cfg), note: `R:R ${rr.toFixed(2)} < ${cfg.antiLate.minRR}` }, isSeen(sig));
      } else if (!(cost <= cfg.antiLate.maxCostR)) {
        push({ status: "rejected_rr", group: buildGroup(ev, [sig], cfg), note: `cost ${cost.toFixed(2)}R > ${cfg.antiLate.maxCostR}R (stop too tight)` }, isSeen(sig));
      } else entries.push(sig);
    }

    // Opposite directions on the same symbol → suppress both.
    const dirs = new Set(entries.map((x) => x.direction));
    const conflictWithBook = (dir: Direction) => book.activeGroup(ev.symbol, dir === "long" ? "short" : "long", now);
    if (dirs.size > 1) {
      for (const dir of dirs) {
        const comps = entries.filter((x) => x.direction === dir);
        push({ status: "suppressed_conflict", group: buildGroup(ev, comps, cfg), note: "opposite-direction signals in the same cycle" }, comps.every(isSeen));
      }
    } else {
      for (const dir of dirs) {
        const comps = entries.filter((x) => x.direction === dir);
        const opposite = conflictWithBook(dir);
        if (opposite) {
          push({ status: "suppressed_conflict", group: buildGroup(ev, comps, cfg), target: opposite, note: "opposite-direction group active within the confluence window" }, comps.every(isSeen));
          continue;
        }
        const existing = book.activeGroup(ev.symbol, dir, now);
        if (existing) {
          const added = comps.filter((x) => !existing.strategies.includes(x.strategy));
          if (!added.length) continue;
          push({ status: "upgrade", group: buildGroup(ev, added, cfg, existing.strategies), target: existing }, false);
          continue;
        }
        const group = buildGroup(ev, comps, cfg);
        const late = lateReason(group.primary, ev.price, ev.atr15m, cfg);
        const watch = comps.some((x) => x.strategy === "pre_pump") ? book.activeWatch(ev.symbol, dir, now) : undefined;
        push(late ? { status: "missed", group, note: late } : { status: "send", group, target: watch }, comps.every(isSeen));
      }
    }

    // WATCH signals (no grading; pointless if an entry is already live on that side).
    for (const sig of fresh.filter((x) => x.kind === "watch")) {
      if (book.hasActiveEntry(ev.symbol, sig.direction) || book.activeWatch(ev.symbol, sig.direction, now)) continue;
      push({ status: "send", group: buildGroup(ev, [sig], cfg) }, isSeen(sig));
    }
  }

  // Hourly cap: keep the highest grade, then confidence; ENTRY before WATCH.
  const sendable = decisions
    .filter((d) => d.status === "send")
    .sort(
      (a, b) =>
        Number(a.group.kind === "watch") - Number(b.group.kind === "watch") ||
        GRADE_ORDER[a.group.grade] - GRADE_ORDER[b.group.grade] ||
        b.group.confidence - a.group.confidence,
    );
  let room = cfg.cooldown.maxPerHour - book.sentSince(now - 3_600_000);
  for (const d of sendable) {
    if (room > 0) room -= 1;
    else {
      d.status = "capped" as DecisionStatus;
      d.note = `hourly cap ${cfg.cooldown.maxPerHour}`;
    }
  }

  // A retried signal that fails again is not logged a second time.
  return decisions.filter((d) => !(quietIfFail.has(d) && d.status !== "send"));
}
