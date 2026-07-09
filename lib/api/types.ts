export type Timeframe = "15m" | "1h" | "4h" | "1d" | "1w";
export type Trend = "bullish" | "bearish" | "neutral";
export type VolumeStatus = "high" | "normal" | "low";
export type MarketType = "spot" | "futures";
export type TradeSide = "long" | "short" | null;
export type Verdict = "enter" | "wait" | "avoid";

export type StrategyType =
  | "trend_pullback"
  | "breakout_retest"
  | "ema_crossover"
  | "rsi_divergence";

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
  verdict: Verdict;
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

export interface AnalyzeIndicators {
  ema50: number;
  ema200: number;
  rsi: number;
  atr: number;
  support: number;
  resistance: number;
  volumeStatus: VolumeStatus;
}

export interface FuturesGuidance {
  suggestedLeverage: number;
  maxSafeLeverage: number;
  requiredMargin: number;
  note: string;
}

export interface AnalyzeRisk {
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  riskAmount: number;
  notional: number;
  riskRewardRatio: number;
  futures?: FuturesGuidance;
  warning?: string;
}

export interface AnalyzePayload {
  symbol: string;
  capital: number;
  riskPercent: number;
  interval: Timeframe;
  marketType: MarketType;
}

export interface AnalyzeResponse {
  symbol: string;
  interval: string;
  marketType: MarketType;
  currentPrice: number;
  trend: Trend;
  indicators: AnalyzeIndicators;
  risk: AnalyzeRisk;
  strategy: StrategyInfo;
  verdict: VerdictInfo;
  analysis?: string;
}

export interface ScreenerCoin {
  symbol: string;
  currentPrice: number;
  priceChangePercent: number;
  trend: Trend;
  verdict: Verdict;
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
  coins: ScreenerCoin[];
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

export interface WatchlistItem {
  _id: string;
  symbol: string;
  marketType: MarketType;
  note: string;
  createdAt: string;
}

export interface Trade {
  _id: string;
  symbol: string;
  marketType: MarketType;
  side: "long" | "short";
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  status: "open" | "closed";
  exitPrice?: number;
  rMultiple?: number;
  pnl?: number;
  notes: string;
  openedAt: string;
  closedAt?: string;
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

export type AlertType =
  | "price_above"
  | "price_below"
  | "entry_zone"
  | "verdict_enter";

export interface Alert {
  _id: string;
  symbol: string;
  marketType: MarketType;
  type: AlertType;
  targetPrice?: number;
  interval: string;
  status: "active" | "triggered" | "cancelled";
  message: string;
  triggeredAt?: string;
  createdAt: string;
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

export interface InvestScreenerCoin {
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
  coins: InvestScreenerCoin[];
}
