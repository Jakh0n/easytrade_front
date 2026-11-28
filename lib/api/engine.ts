import { apiFetch } from "./client";
import type { EngineRunResult, EngineSignalRecord, EngineStatsResponse } from "./types";

export function fetchEngineStats(days: number): Promise<EngineStatsResponse> {
  return apiFetch<EngineStatsResponse>("/api/engine/stats", { auth: true, query: { days: String(days) } });
}

export function fetchEngineSignals(limit = 100, all = false): Promise<{ signals: EngineSignalRecord[] }> {
  return apiFetch<{ signals: EngineSignalRecord[] }>("/api/engine/signals", {
    auth: true,
    query: { limit: String(limit), all: all ? "1" : "0" },
  });
}

export function runEngineNow(): Promise<EngineRunResult> {
  return apiFetch<EngineRunResult>("/api/engine/run", { method: "POST", auth: true });
}
