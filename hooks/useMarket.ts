"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  analyzeSymbol,
  analyzeInvest,
  fetchBacktest,
  fetchInvestScreener,
  fetchMarketScreener,
} from "@/lib/api";
import type { InvestHorizon, MarketType, Timeframe } from "@/lib/api";

export function useAnalyze() {
  return useMutation({ mutationFn: analyzeSymbol });
}

export function useScreener(
  marketType: MarketType,
  interval: Timeframe,
  limit: number = 20,
) {
  return useQuery({
    queryKey: ["screener", marketType, interval, limit],
    queryFn: () => fetchMarketScreener(marketType, interval, limit),
    staleTime: 60_000,
  });
}

export function useBacktest(
  symbol: string | null,
  interval: Timeframe,
  marketType: MarketType,
) {
  return useQuery({
    queryKey: ["backtest", symbol, interval, marketType],
    queryFn: () => fetchBacktest(symbol as string, interval, marketType),
    enabled: Boolean(symbol),
    staleTime: 5 * 60_000,
  });
}

export function useInvest() {
  return useMutation({ mutationFn: analyzeInvest });
}

export function useInvestScreener(horizon: InvestHorizon, limit: number = 15) {
  return useQuery({
    queryKey: ["invest-screener", horizon, limit],
    queryFn: () => fetchInvestScreener(horizon, limit),
    staleTime: 10 * 60_000,
  });
}
