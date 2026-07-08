import { apiFetch } from "./client";
import type { Alert, AlertType, MarketType, Timeframe } from "./types";

export interface CreateAlertInput {
  symbol: string;
  marketType: MarketType;
  type: AlertType;
  targetPrice?: number;
  interval?: Timeframe;
}

export async function fetchAlerts(): Promise<Alert[]> {
  const data = await apiFetch<{ alerts: Alert[] }>("/api/alerts", {
    auth: true,
  });
  return data.alerts;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  const data = await apiFetch<{ alert: Alert }>("/api/alerts", {
    method: "POST",
    body: input,
    auth: true,
  });
  return data.alert;
}

export function deleteAlert(id: string): Promise<void> {
  return apiFetch<void>(`/api/alerts/${id}`, { method: "DELETE", auth: true });
}
