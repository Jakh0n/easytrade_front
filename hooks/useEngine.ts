"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchEngineSignals, fetchEngineStats, runEngineNow } from "@/lib/api";

export function useEngineStats(days: number) {
  return useQuery({
    queryKey: ["engine-stats", days],
    queryFn: () => fetchEngineStats(days),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}

export function useEngineSignals(all: boolean) {
  return useQuery({
    queryKey: ["engine-signals", all],
    queryFn: () => fetchEngineSignals(100, all),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useRunEngine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: runEngineNow,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["engine-stats"] });
      void client.invalidateQueries({ queryKey: ["engine-signals"] });
    },
  });
}
