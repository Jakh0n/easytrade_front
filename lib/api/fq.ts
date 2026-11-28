import { apiFetch } from "./client";
import type {
  FqAnalysis,
  FqScanResponse,
  MarketType,
  SignalRunResult,
  SignalsResponse,
  StrategyId,
} from "./types";

export function fetchFqScan(
  marketType: MarketType = "futures",
  refresh = false,
): Promise<FqScanResponse> {
  return apiFetch<FqScanResponse>("/api/fq/scan", {
    auth: true,
    query: { marketType, refresh: refresh ? "1" : undefined },
  });
}

export function fetchFqAnalysis(
  symbol: string,
  marketType: MarketType = "futures",
): Promise<FqAnalysis> {
  return apiFetch<FqAnalysis>("/api/fq/analyze", {
    auth: true,
    query: { symbol, marketType },
  });
}

export function fetchSignals(strategy?: StrategyId): Promise<SignalsResponse> {
  return apiFetch<SignalsResponse>("/api/signals", { auth: true, query: { strategy } });
}

export function runSignalsNow(): Promise<SignalRunResult> {
  return apiFetch<SignalRunResult>("/api/signals/run", { method: "POST", auth: true });
}

export function sendTelegramTest(): Promise<void> {
  return apiFetch<void>("/api/signals/test", { method: "POST", auth: true });
}
