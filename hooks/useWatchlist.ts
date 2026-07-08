"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addWatchlistItem,
  fetchWatchlist,
  removeWatchlistItem,
} from "@/lib/api";

const WATCHLIST_KEY = ["watchlist"] as const;

export function useWatchlist(enabled: boolean = true) {
  return useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: fetchWatchlist,
    enabled,
  });
}

export function useAddWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addWatchlistItem,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });
}

export function useRemoveWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeWatchlistItem,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });
}
