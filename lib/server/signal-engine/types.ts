import type { Candle } from "../types/index";
import type { EngineConfig, Regime, StrategyName } from "./config";
import type { Indicators } from "./indicators";

export type Direction = "long" | "short";
export type SignalKind = "entry" | "watch";
export type Grade = "A" | "B" | "C";

export interface OiPoint {
  time: number;
  /** Open interest in contracts (base asset). */
  oi: number;
}

/**
 * Everything a strategy may look at for one symbol at decision time `now`.
 * Candle arrays hold CLOSED candles only — live and backtest providers both enforce it,
 * which is what keeps the backtest free of look-ahead.
 */
export interface MarketData {
  symbol: string;
  now: number;
  /** Latest traded price (live: forming 5m candle close; backtest: last closed 5m close). */
  price: number;
  c4h: Candle[];
  c1h: Candle[];
  c15m: Candle[];
  c5m: Candle[];
  oi: OiPoint[];
  /** Current funding rate, fraction (0.0001 = 0.01%). null when unknown. */
  funding: number | null;
  volume24hUsd: number;
  /** BTC 1H closed candles — BTC filter and relative strength. */
  btc1h: Candle[];
}

/** What a strategy's `evaluate` receives: raw data plus indicators computed once per symbol. */
export interface StrategyInput {
  data: MarketData;
  ind: Indicators;
  regime: Regime;
  cfg: EngineConfig;
}

export type FactorValue = number | boolean | string | null;

export interface Invalidation {
  timeframe: "1h" | "15m";
  /** Pending signal is cancelled when a candle of `timeframe` closes below (long) / above (short) `level`. */
  level: number;
  /** Breakout-retest: cancel on a close back inside, i.e. on the opposite side of the level. */
  description: string;
}

export interface Signal {
  symbol: string;
  direction: Direction;
  strategy: StrategyName;
  kind: SignalKind;
  /** ENTRY: limit zone. WATCH: the range to watch. */
  entryZoneLow: number;
  entryZoneHigh: number;
  /** null for WATCH. */
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  confidence: number;
  /** Close time of the trigger candle. Same strategy + symbol + direction + triggerTime = same signal. */
  triggerTime: number;
  expiresAt: number;
  invalidation: Invalidation | null;
  reasons: string[];
  /** All factor values at signal time — stored for stats and ML re-weighting. */
  factors: Record<string, FactorValue>;
}

export interface Strategy {
  name: StrategyName;
  evaluate(symbol: string, input: StrategyInput): Signal | null;
}

export type DecisionStatus =
  | "send" // new message
  | "upgrade" // joins an already-sent group → grade upgrade reply
  | "missed"
  | "rejected_rr"
  | "suppressed_conflict"
  | "capped";

/** One merged (confluence) signal, the unit that becomes a Telegram message and a DB row. */
export interface GroupedSignal {
  key: string;
  symbol: string;
  direction: Direction;
  kind: SignalKind;
  regime: Regime;
  strategies: StrategyName[];
  grade: Grade;
  confidence: number;
  /** Levels come from the highest-confidence component. */
  primary: Signal;
  components: Signal[];
  createdAt: number;
  expiresAt: number;
  price: number;
  atr15m: number;
  reasons: string[];
  factors: Record<string, FactorValue>;
}

export interface Decision {
  status: DecisionStatus;
  group: GroupedSignal;
  /** For "upgrade": the book entry being upgraded. For a pre-pump ENTRY: the WATCH it upgrades. */
  target?: BookEntry;
  note?: string;
}

/** Minimal state the pipeline needs about recent signals (DB in live, memory in backtest). */
export interface BookEntry {
  id: string;
  symbol: string;
  direction: Direction;
  kind: SignalKind;
  strategies: StrategyName[];
  grade: Grade;
  createdAt: number;
  expiresAt: number;
  /** pending/open/tp1 = active; anything else = done. */
  status: string;
  telegramMessageId?: number | null;
}
