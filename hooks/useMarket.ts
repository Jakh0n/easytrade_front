"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { analyzeSymbol, fetchBacktest, fetchMarketScreener } from "@/lib/api";
import type { MarketType, Timeframe } from "@/lib/api";

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
