import { apiFetch } from "./client";
import type { JournalStats, MarketType, Trade } from "./types";

export interface CreateTradeInput {
  symbol: string;
  marketType: MarketType;
  side: "long" | "short";
  strategy?: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  notes?: string;
}

export async function fetchTrades(status?: "open" | "closed"): Promise<Trade[]> {
  const data = await apiFetch<{ trades: Trade[] }>("/api/journal", {
    auth: true,
    query: status ? { status } : undefined,
  });
  return data.trades;
}

export async function createTrade(input: CreateTradeInput): Promise<Trade> {
  const data = await apiFetch<{ trade: Trade }>("/api/journal", {
    method: "POST",
    body: input,
    auth: true,
  });
  return data.trade;
}

export async function closeTrade(
  id: string,
  exitPrice: number,
  notes?: string,
): Promise<Trade> {
  const data = await apiFetch<{ trade: Trade }>(`/api/journal/${id}/close`, {
    method: "PATCH",
    body: { exitPrice, notes },
    auth: true,
  });
  return data.trade;
}

export function deleteTrade(id: string): Promise<void> {
  return apiFetch<void>(`/api/journal/${id}`, { method: "DELETE", auth: true });
}

export function fetchJournalStats(): Promise<JournalStats> {
  return apiFetch<JournalStats>("/api/journal/stats", { auth: true });
}
