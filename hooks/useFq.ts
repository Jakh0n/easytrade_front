"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDayScan,
  fetchFqAnalysis,
  fetchFqScan,
  fetchSignals,
  runSignalsNow,
  sendTelegramTest,
  type MarketType,
  type StrategyId,
} from "@/lib/api";

export function useFqScan(marketType: MarketType) {
  return useQuery({
    queryKey: ["fq-scan", marketType],
    queryFn: () => fetchFqScan(marketType),
    staleTime: 3 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useRefreshScan(marketType: MarketType) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => fetchFqScan(marketType, true),
    onSuccess: (data) => client.setQueryData(["fq-scan", marketType], data),
  });
}

export function useDayScan(marketType: MarketType, enabled = true) {
  return useQuery({
    queryKey: ["day-scan", marketType],
    queryFn: () => fetchDayScan(marketType),
    enabled,
    staleTime: 60_000,
    // 15M shamlar — skanerni tez-tez yangilab turamiz.
    refetchInterval: 2 * 60_000,
  });
}

export function useRefreshDayScan(marketType: MarketType) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => fetchDayScan(marketType, true),
    onSuccess: (data) => client.setQueryData(["day-scan", marketType], data),
  });
}

export function useFqAnalysis(symbol: string, marketType: MarketType) {
  return useQuery({
    queryKey: ["fq-analysis", symbol, marketType],
    queryFn: () => fetchFqAnalysis(symbol, marketType),
    enabled: symbol.length > 0,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useSignals(strategy?: StrategyId) {
  return useQuery({
    queryKey: ["signals", strategy ?? "all"],
    queryFn: () => fetchSignals(strategy),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

export function useRunSignals() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: runSignalsNow,
    onSuccess: () => void client.invalidateQueries({ queryKey: ["signals"] }),
  });
}

export function useTelegramTest() {
  return useMutation({ mutationFn: sendTelegramTest });
}
