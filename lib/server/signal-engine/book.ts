/**
 * SignalBook — the recent-signal state the pipeline needs for confluence, conflicts,
 * cooldowns and the hourly cap. Live hydrates it from MongoDB each run; the backtest keeps
 * it in memory. Both mutate it ONLY through `applyDecisions`, so the rules behave identically.
 */
import type { EngineConfig, StrategyName } from "./config";
import type { BookEntry, Decision, Direction, Grade, Signal, SignalKind } from "./types";

export const ACTIVE_STATUSES = new Set(["pending", "open", "tp1", "watch"]);

export function rawKey(s: Pick<Signal, "strategy" | "symbol" | "direction" | "kind" | "triggerTime">): string {
  return `${s.strategy}:${s.symbol}:${s.direction}:${s.kind}:${s.triggerTime}`;
}

export function gradeFor(count: number, cfg: EngineConfig): Grade {
  return count >= cfg.confluence.gradeA ? "A" : count >= cfg.confluence.gradeB ? "B" : "C";
}

export class SignalBook {
  /** Emitted (sent / would-be-sent) groups. */
  entries: BookEntry[] = [];
  /** raw signal key → last decision status, so a re-evaluated signal is not logged twice. */
  seen = new Map<string, string>();

  constructor(private readonly cfg: EngineConfig) {}

  inCooldown(symbol: string, strategy: StrategyName, direction: Direction, kind: SignalKind, now: number): boolean {
    const since = now - this.cfg.cooldown.sameSetupHours * 3_600_000;
    return this.entries.some(
      (e) => e.symbol === symbol && e.direction === direction && e.kind === kind && e.createdAt > since && e.strategies.includes(strategy),
    );
  }

  /** Active ENTRY group for symbol + direction created within the confluence window. */
  activeGroup(symbol: string, direction: Direction, now: number): BookEntry | undefined {
    const since = now - this.cfg.confluence.windowMin * 60_000;
    return this.entries.find(
      (e) => e.symbol === symbol && e.direction === direction && e.kind === "entry" && e.createdAt >= since && ACTIVE_STATUSES.has(e.status),
    );
  }

  activeWatch(symbol: string, direction: Direction, now: number): BookEntry | undefined {
    return this.entries.find(
      (e) => e.symbol === symbol && e.direction === direction && e.kind === "watch" && e.status === "watch" && e.expiresAt > now,
    );
  }

  hasActiveEntry(symbol: string, direction: Direction): boolean {
    return this.entries.some((e) => e.symbol === symbol && e.direction === direction && e.kind === "entry" && ACTIVE_STATUSES.has(e.status));
  }

  sentSince(time: number): number {
    return this.entries.filter((e) => e.createdAt >= time).length;
  }

  /** Drop entries no rule can reach any more (memory bound for long backtests). */
  prune(now: number): void {
    const keepMs = Math.max(this.cfg.cooldown.sameSetupHours, 24) * 3_600_000;
    this.entries = this.entries.filter((e) => e.createdAt > now - keepMs || ACTIVE_STATUSES.has(e.status));
    if (this.seen.size > 50_000) this.seen.clear();
  }
}

/**
 * Applies pipeline decisions to the book. `newId` gives the id for each new entry
 * (Mongo ObjectId in live, counter in backtest).
 */
export function applyDecisions(book: SignalBook, decisions: Decision[], newId: (d: Decision) => string): Map<Decision, BookEntry> {
  const created = new Map<Decision, BookEntry>();
  for (const d of decisions) {
    for (const c of d.group.components) book.seen.set(rawKey(c), d.status);
    if (d.status === "send") {
      const entry: BookEntry = {
        id: newId(d),
        symbol: d.group.symbol,
        direction: d.group.direction,
        kind: d.group.kind,
        strategies: [...d.group.strategies],
        grade: d.group.grade,
        createdAt: d.group.createdAt,
        expiresAt: d.group.expiresAt,
        status: d.group.kind === "watch" ? "watch" : "pending",
      };
      book.entries.push(entry);
      created.set(d, entry);
      // A pre-pump ENTRY consumes the WATCH it upgrades.
      if (d.target && d.target.kind === "watch") d.target.status = "upgraded";
    } else if (d.status === "upgrade" && d.target) {
      d.target.strategies = [...d.group.strategies];
      d.target.grade = d.group.grade;
    }
  }
  return created;
}
