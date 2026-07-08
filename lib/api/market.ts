import { type StreamHandlers, apiFetch, streamSSE } from "./client";
import type {
  AnalyzePayload,
  AnalyzeResponse,
  BacktestSummary,
  MarketType,
  ScreenerResponse,
  Timeframe,
} from "./types";

export function analyzeSymbol(
  payload: AnalyzePayload,
): Promise<AnalyzeResponse> {
  return apiFetch<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: { ...payload, symbol: payload.symbol.toUpperCase() },
  });
}

export function streamAnalyzeSummary(
  payload: AnalyzePayload,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return streamSSE(
    "/api/analyze/summary",
    { ...payload, symbol: payload.symbol.toUpperCase() },
    handlers,
    signal,
  );
}

export function fetchMarketScreener(
  marketType: MarketType = "spot",
  interval: Timeframe = "4h",
  limit: number = 20,
): Promise<ScreenerResponse> {
  return apiFetch<ScreenerResponse>("/api/screener", {
    query: { marketType, interval, limit },
  });
}

export function fetchBacktest(
  symbol: string,
  interval: Timeframe = "4h",
  marketType: MarketType = "spot",
): Promise<BacktestSummary> {
  return apiFetch<BacktestSummary>("/api/backtest", {
    query: { symbol: symbol.toUpperCase(), interval, marketType },
  });
}
