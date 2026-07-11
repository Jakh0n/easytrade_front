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

export type Trend = "bullish" | "bearish" | "neutral";
export type VolumeStatus = "high" | "normal" | "low";
export type MarketType = "spot" | "futures";
export type TradeSide = "long" | "short" | null;

export type PatternDirection = "bullish" | "bearish";

export type PatternType =
  | "bullish_engulfing"
  | "bearish_engulfing"
  | "hammer"
  | "shooting_star";

export interface CandlePattern {
  type: PatternType;
  label: string;
  direction: PatternDirection;
  volumeConfirmed: boolean;
}

export interface SupportResistance {
  support: number;
  resistance: number;
}

export interface PositionSizingParams {
  currentPrice: number;
  stopLoss: number;
  capital: number;
  riskPercent: number;
  marketType: MarketType;
}

export interface FuturesGuidance {
  suggestedLeverage: number;
  maxSafeLeverage: number;
  requiredMargin: number;
  note: string;
}

export interface PositionSizingResult {
  positionSize: number;
  riskAmount: number;
  notional: number;
  futures?: FuturesGuidance;
  warning?: string;
}

export interface AnalysisIndicators {
  ema50: number;
  ema200: number;
  rsi: number;
  atr: number;
  support: number;
  resistance: number;
  volumeStatus: VolumeStatus;
}

export interface AnalysisRisk {
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  riskAmount: number;
  notional: number;
  riskRewardRatio: number;
  futures?: FuturesGuidance;
}

export interface AnalysisInput {
  symbol: string;
  currentPrice: number;
  trend: string;
  marketType: string;
  indicators: AnalysisIndicators;
  risk: AnalysisRisk;
  strategy: StrategyInfo;
  verdict: VerdictInfo;
}

export interface AnalyzeRequestBody {
  symbol: string;
  capital?: number;
  riskPercent?: number;
  interval?: string;
  marketType?: MarketType;
}

export type StrategyType =
  | "trend_pullback"
  | "breakout_retest"
  | "ema_crossover"
  | "rsi_divergence";

export interface StrategyChecklistItem {
  label: string;
  passed: boolean;
  detail: string;
}

export interface StrategyInfo {
  type: StrategyType;
  label: string;
  description: string;
  confidence: number;
  checklist: StrategyChecklistItem[];
}

export interface VerdictInfo {
  verdict: "enter" | "wait" | "avoid";
  verdictLabel: string;
  side: TradeSide;
  headline: string;
  reason: string;
  rrNow: number;
  rrIdeal: number;
  entryZone: [number, number];
  invalidation: number;
  stopLoss: number;
  takeProfit: number;
  pattern?: CandlePattern | null;
  confluence?: number;
  htfTrend?: Trend;
  htfInterval?: string;
  mtfNote?: string;
  btcTrend?: Trend;
  btcAligned?: boolean;
  btcNote?: string;
}

export interface ScreenerCoinResult {
  symbol: string;
  currentPrice: number;
  priceChangePercent: number;
  trend: Trend;
  verdict: "enter" | "wait" | "avoid";
  verdictLabel: string;
  side: TradeSide;
  reason: string;
  rrNow: number;
  rrIdeal: number;
  rsi: number;
  strategy: StrategyInfo;
  volumeStatus: VolumeStatus;
  quoteVolume: number;
  opportunityScore: number;
}

export interface ScreenerResponse {
  scanned: number;
  interval: string;
  marketType: MarketType;
  updatedAt: string;
  coins: ScreenerCoinResult[];
}

export interface EquityPoint {
  date: string;
  cumulativePnl: number;
}

export interface JournalStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  expectancy: number;
  totalPnl: number;
  equityCurve: EquityPoint[];
}

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

export type InvestHorizon = "1_3" | "3_6" | "6_12" | "12_24";

export type InvestVerdict = "accumulate" | "dca_wait" | "avoid";

export interface DcaTranche {
  label: string;
  price: number;
  allocationPercent: number;
  amountUsd: number;
  units: number;
  note: string;
}

export interface InvestTarget {
  label: string;
  price: number;
  upsidePercent: number;
}

export interface InvestAnalysis {
  symbol: string;
  horizon: InvestHorizon;
  horizonLabel: string;
  currentPrice: number;
  verdict: InvestVerdict;
  verdictLabel: string;
  score: number;
  reason: string;
  trend: Trend;
  weeklyRsi: number;
  high52w: number;
  low52w: number;
  drawdownFromHigh: number;
  supportZones: number[];
  targets: InvestTarget[];
  invalidation: number;
  maxLossPercent: number;
  averageEntry: number;
  dcaPlan: DcaTranche[];
  checklist: StrategyChecklistItem[];
  btcTrend: Trend;
  generatedAt: string;
}

export interface InvestScreenerCoinResult {
  symbol: string;
  currentPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  horizon: InvestHorizon;
  horizonLabel: string;
  verdict: InvestVerdict;
  verdictLabel: string;
  score: number;
  reason: string;
  trend: Trend;
  weeklyRsi: number;
  drawdownFromHigh: number;
  topTargetUpside: number;
  opportunityScore: number;
}

export interface InvestScreenerResponse {
  scanned: number;
  horizon: InvestHorizon;
  btcTrend: Trend;
  updatedAt: string;
  coins: InvestScreenerCoinResult[];
}

export interface BacktestStrategyStat {
  strategy: StrategyType;
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  expectancy: number;
}

export interface BacktestSummary {
  symbol: string;
  interval: string;
  marketType: MarketType;
  candlesAnalyzed: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  expectancy: number;
  byStrategy: BacktestStrategyStat[];
  generatedAt: string;
}

export type CustomStrategyId = "ema_smc";

export type EmaSmcVerdict = "enter" | "wait" | "avoid";

export interface StrategyDefinition {
  id: CustomStrategyId;
  name: string;
  shortName: string;
  description: string;
  timeframes: string;
  checklist: string[];
  minRiskReward: number;
  riskPercent: number;
}

export interface StrategiesListResponse {
  strategies: StrategyDefinition[];
}

export interface EmaSmcScreenerCoinResult {
  symbol: string;
  currentPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  side: TradeSide;
  verdict: EmaSmcVerdict;
  verdictLabel: string;
  score: number;
  reason: string;
  trendDirection: "bullish" | "bearish";
  riskReward: number;
  entryType: "fvg" | "ob" | null;
  stopLoss: number;
  takeProfit: number;
  sweep: { level: number; levelType: string } | null;
  structure: { type: "bos" | "choch"; level: number } | null;
  opportunityScore: number;
}

export interface EmaSmcScreenerResponse {
  strategyId: CustomStrategyId;
  scanned: number;
  marketType: MarketType;
  updatedAt: string;
  coins: EmaSmcScreenerCoinResult[];
}

export interface EmaSmcAnalysisResponse {
  symbol: string;
  marketType: MarketType;
  currentPrice: number;
  side: TradeSide;
  verdict: EmaSmcVerdict;
  verdictLabel: string;
  score: number;
  reason: string;
  ema200: number;
  trendDirection: "bullish" | "bearish";
  keyLevels: {
    pdh: number;
    pdl: number;
    eqh: number | null;
    eql: number | null;
  };
  sweep: { level: number; levelType: string } | null;
  structure: { type: "bos" | "choch"; level: number } | null;
  entryType: "fvg" | "ob" | null;
  entryZone: [number, number] | null;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  checklist: StrategyChecklistItem[];
  generatedAt: string;
}
