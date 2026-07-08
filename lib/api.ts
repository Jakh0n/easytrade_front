export type Timeframe = "4h" | "1d";
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
}

export interface AnalyzePayload {
  symbol: string;
  capital: number;
  riskPercent: number;
  interval: Timeframe;
  marketType: MarketType;
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

export interface AnalyzeRisk {
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  riskRewardRatio: number;
  warning?: string;
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
  analysis: string;
}

export interface ApiErrorResponse {
  error: string;
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
  rrIdeal: number;
  rsi: number;
  strategy: StrategyInfo;
}

export interface ScreenerResponse {
  scanned: number;
  interval: string;
  marketType: MarketType;
  updatedAt: string;
  coins: ScreenerCoin[];
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function analyzeSymbol(
  payload: AnalyzePayload,
): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: payload.symbol.toUpperCase(),
      capital: payload.capital,
      riskPercent: payload.riskPercent,
      interval: payload.interval,
      marketType: payload.marketType,
    }),
  });

  const data = (await response.json()) as AnalyzeResponse | ApiErrorResponse;

  if (!response.ok) {
    const message =
      "error" in data ? data.error : "Tahlil so'rovida xato yuz berdi";
    throw new ApiError(message, response.status);
  }

  return data as AnalyzeResponse;
}

export async function fetchMarketScreener(
  marketType: MarketType = "spot",
  interval: Timeframe = "4h",
  limit: number = 12,
): Promise<ScreenerResponse> {
  const params = new URLSearchParams({
    interval,
    limit: String(limit),
    marketType,
  });

  const response = await fetch(`${API_URL}/api/screener?${params.toString()}`);
  const data = (await response.json()) as ScreenerResponse | ApiErrorResponse;

  if (!response.ok) {
    const message = "error" in data ? data.error : "Screener yuklanmadi";
    throw new ApiError(message, response.status);
  }

  return data as ScreenerResponse;
}
