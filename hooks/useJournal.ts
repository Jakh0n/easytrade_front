"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closeTrade,
  createTrade,
  deleteTrade,
  fetchJournalStats,
  fetchTrades,
} from "@/lib/api";

const TRADES_KEY = ["journal", "trades"] as const;
const STATS_KEY = ["journal", "stats"] as const;

export function useTrades() {
  return useQuery({ queryKey: TRADES_KEY, queryFn: () => fetchTrades() });
}

export function useJournalStats() {
  return useQuery({ queryKey: STATS_KEY, queryFn: fetchJournalStats });
}

function useJournalMutation<TArgs, TResult>(
  mutationFn: (args: TArgs) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRADES_KEY });
      void queryClient.invalidateQueries({ queryKey: STATS_KEY });
    },
  });
}

export function useCreateTrade() {
  return useJournalMutation(createTrade);
}

export function useCloseTrade() {
  return useJournalMutation(
    (args: { id: string; exitPrice: number; notes?: string }) =>
      closeTrade(args.id, args.exitPrice, args.notes),
  );
}

export function useDeleteTrade() {
  return useJournalMutation(deleteTrade);
}
