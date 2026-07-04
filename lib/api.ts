export type Timeframe = "4h" | "1d";
export type Trend = "bullish" | "bearish" | "neutral";
export type VolumeStatus = "high" | "normal" | "low";

export interface AnalyzePayload {
  symbol: string;
  capital: number;
  riskPercent: number;
  interval: Timeframe;
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
  currentPrice: number;
  trend: Trend;
  indicators: AnalyzeIndicators;
  risk: AnalyzeRisk;
  analysis: string;
}

export interface ApiErrorResponse {
  error: string;
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
