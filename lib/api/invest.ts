import { apiFetch } from "./client";
import type { InvestAnalysis, InvestHorizon, InvestScreenerResponse } from "./types";

export interface InvestPayload {
  symbol: string;
  capital: number;
  horizon: InvestHorizon;
}

export function analyzeInvest(payload: InvestPayload): Promise<InvestAnalysis> {
  return apiFetch<InvestAnalysis>("/api/invest", {
    method: "POST",
    body: { ...payload, symbol: payload.symbol.toUpperCase() },
  });
}

export function fetchInvestScreener(
  horizon: InvestHorizon = "3_6",
  limit: number = 15,
): Promise<InvestScreenerResponse> {
  return apiFetch<InvestScreenerResponse>("/api/invest/screener", {
    query: { horizon, limit },
  });
}
