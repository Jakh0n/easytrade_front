import { apiFetch } from "./client";
import type { MarketType, WatchlistItem } from "./types";

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const data = await apiFetch<{ items: WatchlistItem[] }>("/api/watchlist", {
    auth: true,
  });
  return data.items;
}

export async function addWatchlistItem(input: {
  symbol: string;
  marketType: MarketType;
  note?: string;
}): Promise<WatchlistItem> {
  const data = await apiFetch<{ item: WatchlistItem }>("/api/watchlist", {
    method: "POST",
    body: input,
    auth: true,
  });
  return data.item;
}

export function removeWatchlistItem(id: string): Promise<void> {
  return apiFetch<void>(`/api/watchlist/${id}`, {
    method: "DELETE",
    auth: true,
  });
}
