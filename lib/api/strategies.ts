import { apiFetch } from "./client";
import type {
  CustomStrategyId,
  EmaSmcAnalysis,
  EmaSmcScreenerResponse,
  MarketType,
  StrategiesListResponse,
} from "./types";

export function fetchStrategies(): Promise<StrategiesListResponse> {
  return apiFetch<StrategiesListResponse>("/api/strategies");
}

export function fetchStrategyScreener(
  strategyId: CustomStrategyId = "ema_smc",
  marketType: MarketType = "futures",
  limit: number = 15,
): Promise<EmaSmcScreenerResponse> {
  return apiFetch<EmaSmcScreenerResponse>("/api/strategies/screener", {
    query: { strategyId, marketType, limit },
  });
}

export interface StrategyAnalyzePayload {
  strategyId: CustomStrategyId;
  symbol: string;
  marketType: MarketType;
}

export function analyzeStrategy(
  payload: StrategyAnalyzePayload,
): Promise<EmaSmcAnalysis> {
  return apiFetch<EmaSmcAnalysis>("/api/strategies/analyze", {
    method: "POST",
    body: {
      strategyId: payload.strategyId,
      symbol: payload.symbol.toUpperCase(),
      marketType: payload.marketType,
    },
  });
}
