export type {
  AuthResponse,
  FqAnalysisResponse as FqAnalysis,
  FqScanCoin,
  FqScanResponse,
  FqSetupType,
  FqVerdict,
  MarketType,
  PublicUser,
  SignalRecord,
  SignalRunResult,
  SignalStatus,
  SignalsResponse,
  StrategyChecklistItem,
  StrategyId,
  TradeSide,
  UserSettings,
} from "@/lib/server/types";

// ───────────── Signal engine v2 ─────────────

export type EngineStrategyId = "trend_pullback" | "pre_pump" | "funding_squeeze" | "liquidity_sweep" | "breakout_retest";

export interface EngineStrategySummary {
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
  /** null when JSON-serialised from Infinity (no losing trades). */
  profitFactor: number | null;
  maxDrawdownR: number;
  avgMinutesToTp1: number | null;
}

export interface EngineStatsResponse {
  days: number;
  stats: {
    overall: EngineStrategySummary;
    byStrategy: Record<string, EngineStrategySummary>;
    byPrimaryStrategy: Record<string, EngineStrategySummary>;
    byStrategyRegime: Record<string, Record<string, EngineStrategySummary>>;
    byGrade: Record<string, EngineStrategySummary>;
  };
  filtered: Record<string, Record<string, number>>;
  watches: { total: number; upgraded: number };
  strategies: { id: EngineStrategyId; label: string; enabled: boolean }[];
  telegram: { configured: boolean; enabled: boolean };
}

export interface EngineSignalRecord {
  id: string;
  symbol: string;
  direction: "long" | "short";
  kind: "entry" | "watch";
  regime: string;
  strategies: EngineStrategyId[];
  grade: "A" | "B" | "C";
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
