// ───────────── Binance ─────────────

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface Ticker24hr {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
}

/** Binance /api/v3/klines raw response item */
export type BinanceKlineRaw = [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // closeTime
  ...unknown[],
];

export interface BinanceTicker24hrRaw {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  volume: string;
  quoteVolume: string;
}

/** Binance /fapi/v1/fundingRate raw response item */
export interface BinanceFundingRateRaw {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
}

/** One realised funding settlement. `rate` is a fraction, not a percent. */
export interface FundingRate {
  fundingTime: number;
  rate: number;
}

export type VolumeStatus = "high" | "normal" | "low";
export type MarketType = "spot" | "futures";
export type TradeSide = "long" | "short" | null;

export interface SupportResistance {
  support: number;
  resistance: number;
}

// ───────────── Auth ─────────────

export interface UserSettings {
  capital: number;
  riskPercent: number;
  marketType: MarketType;
  theme: "light" | "dark" | "system";
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  settings: UserSettings;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

// ───────────── FQ Strategy v3 ─────────────

export type FqVerdict = "enter" | "wait" | "avoid";
export type FqSetupType = "pullback" | "breakout";

export interface StrategyChecklistItem {
  label: string;
  passed: boolean;
  detail: string;
}

export interface FqAnalysisResponse {
  /** fq_v3 = Swing 1H, fq_4h = Swing 4H + Fib (bitta dvigatel, turli profil). */
  strategyId: "fq_v3" | "fq_4h";
  symbol: string;
  marketType: MarketType;
  currentPrice: number;
  side: TradeSide;
  verdict: FqVerdict;
  verdictLabel: string;
  score: number;
  reason: string;
  timeframe: string;
  htfTimeframe: string;
  trend: "up" | "down" | "neutral";
  htfBias: "bullish" | "bearish" | null;
  setup: FqSetupType | null;
  signalBarsAgo: number | null;
  /** Signal shamining openTime (ms) — dedupe kaliti. */
  signalTime: number | null;
  /** Oxirgi yopilgan shamning openTime (ms). */
  candleTime: number | null;
  indicators: {
    emaFast: number;
    emaMid: number;
    emaSlow: number;
    rsi: number;
    adx: number;
    diPlus: number;
    diMinus: number;
    atr: number;
  };
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  takeProfit: number;
  riskReward: number;
  riskPercent: number;
  /** Signal shamidagi konfluenslar: "Fib 0.62", "OB+FVG", "Sweep", "BOS". */
  confluences: string[];
  checklist: StrategyChecklistItem[];
  generatedAt: string;
}

export interface FqScanCoin extends FqAnalysisResponse {
  priceChangePercent: number;
  quoteVolume: number;
}

export interface FqScanResponse {
  marketType: MarketType;
  scanned: number;
  updatedAt: string;
  coins: FqScanCoin[];
  stats: {
    enter: number;
    wait: number;
    avoid: number;
    longBias: number;
    shortBias: number;
  };
}

// ───────────── Day trade (Supertrend 15M) ─────────────

export interface DayAnalysis {
  strategyId: "st_day";
  symbol: string;
  marketType: MarketType;
  currentPrice: number;
  timeframe: string;
  htfTimeframe: string;
  htfBias: "bullish" | "bearish" | null;
  /** Hozirgi Supertrend yo'nalishi. */
  stDir: "up" | "down" | null;
  /** Hozirgi Supertrend chizig'i (trailing stop). */
  stLine: number;
  /** 1H trend tomonga oxirgi flip necha sham oldin (topilmasa null). */
  flipBarsAgo: number | null;
  side: TradeSide;
  verdict: FqVerdict;
  reason: string;
  /** Flip shamining openTime (ms) — dedupe kaliti. */
  signalTime: number | null;
  entry: number;
  stopLoss: number;
  /** Kirishdan hozirgi narxgacha, R da (flip bo'lsa). */
  currentR: number | null;
  riskPercent: number;
  priceChangePercent: number;
  quoteVolume: number;
  generatedAt: string;
}

export interface DayScanResponse {
  marketType: MarketType;
  scanned: number;
  updatedAt: string;
  coins: DayAnalysis[];
  stats: { enter: number; inTrade: number; waiting: number; avoid: number };
}

// ───────────── Signal tarixi ─────────────

export type StrategyId = "fq_v3" | "fq_4h" | "st_day";

export type SignalStatus = "open" | "tp1" | "tp2" | "be" | "sl" | "exit" | "expired";

export interface SignalRecord {
  id: string;
  strategy: StrategyId;
  symbol: string;
  marketType: MarketType;
  side: "long" | "short";
  setup: FqSetupType | null;
  signalTime: string;
  entry: number;
  stopLoss: number;
  /** Day trade signallarida TP yo'q — null. */
  tp1: number | null;
  tp2: number | null;
  score: number;
  status: SignalStatus;
  /** Yopilgan savdo natijasi R da (TP1 50% + qolgan qism). Ochiq bo'lsa null. */
  resultR: number | null;
  telegramSent: boolean;
  sentAt: string;
  closedAt: string | null;
}

export interface SignalsResponse {
  signals: SignalRecord[];
  stats: {
    total: number;
    open: number;
    closed: number;
    wins: number;
    losses: number;
    winRate: number;
    totalR: number;
    avgR: number;
  };
  telegram: {
    configured: boolean;
    enabled: boolean;
  };
}

export interface SignalRunResult {
  scanned: number;
  newSignals: number;
  sent: number;
  updated: number;
  errors: string[];
  ranAt: string;
}
