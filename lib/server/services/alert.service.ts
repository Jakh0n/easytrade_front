import { Alert } from "../models/Alert";
import { AppError } from "../utils/AppError";
import { buildTechnicalAnalysis } from "./analysis.service";
import { get24hrTicker } from "./binance.service";
import type { MarketType } from "../types/index";

type AlertType =
  | "price_above"
  | "price_below"
  | "entry_zone"
  | "verdict_enter";

interface CreateAlertInput {
  symbol: string;
  marketType: MarketType;
  type: AlertType;
  targetPrice?: number;
  interval?: string;
}

export async function listAlerts(userId: string, status?: string) {
  const filter: Record<string, unknown> = { userId };
  if (status === "active" || status === "triggered" || status === "cancelled") {
    filter.status = status;
  }
  return Alert.find(filter).sort({ createdAt: -1 }).lean();
}

export async function createAlert(userId: string, input: CreateAlertInput) {
  if (
    (input.type === "price_above" || input.type === "price_below") &&
    (input.targetPrice === undefined || input.targetPrice <= 0)
  ) {
    throw new AppError("targetPrice majburiy", 400);
  }

  return Alert.create({
    userId,
    symbol: input.symbol,
    marketType: input.marketType,
    type: input.type,
    targetPrice: input.targetPrice,
    interval: input.interval ?? "4h",
    status: "active",
  });
}

export async function deleteAlert(userId: string, id: string): Promise<void> {
  const result = await Alert.findOneAndDelete({ _id: id, userId });
  if (!result) {
    throw new AppError("Alert topilmadi", 404);
  }
}

interface EvaluationTarget {
  symbol: string;
  marketType: MarketType;
  needsAnalysis: boolean;
  interval: string;
}

async function loadMarketSnapshot(target: EvaluationTarget): Promise<{
  price: number;
  entryZone?: [number, number];
  isEnter?: boolean;
}> {
  const ticker = await get24hrTicker(target.symbol, target.marketType);

  if (!target.needsAnalysis) {
    return { price: ticker.lastPrice };
  }

  const analysis = await buildTechnicalAnalysis(
    target.symbol,
    target.interval,
    10_000,
    2,
    target.marketType,
    false,
  );

  return {
    price: analysis.currentPrice,
    entryZone: analysis.verdict.entryZone,
    isEnter: analysis.verdict.verdict === "enter",
  };
}

function buildTriggerMessage(
  type: AlertType,
  symbol: string,
  price: number,
): string {
  switch (type) {
    case "price_above":
      return `${symbol} narxi ${price} dan oshdi`;
    case "price_below":
      return `${symbol} narxi ${price} dan tushdi`;
    case "entry_zone":
      return `${symbol} kirish zonasiga yetdi (${price})`;
    default:
      return `${symbol} uchun kirish signali paydo bo'ldi`;
  }
}

let evaluating = false;

/** Evaluates all active alerts against fresh market data; marks matches triggered. */
export async function evaluateAlerts(): Promise<number> {
  if (evaluating) {
    return 0;
  }
  evaluating = true;

  try {
    const active = await Alert.find({ status: "active" });
    if (active.length === 0) {
      return 0;
    }

    const targets = new Map<string, EvaluationTarget>();
    for (const alert of active) {
      const key = `${alert.symbol}:${alert.marketType}`;
      const needsAnalysis =
        alert.type === "entry_zone" || alert.type === "verdict_enter";
      const existing = targets.get(key);
      if (!existing) {
        targets.set(key, {
          symbol: alert.symbol,
          marketType: alert.marketType as MarketType,
          needsAnalysis,
          interval: alert.interval ?? "4h",
        });
      } else if (needsAnalysis) {
        existing.needsAnalysis = true;
      }
    }

    const snapshots = new Map<
      string,
      Awaited<ReturnType<typeof loadMarketSnapshot>>
    >();
    await Promise.all(
      Array.from(targets.entries()).map(async ([key, target]) => {
        try {
          snapshots.set(key, await loadMarketSnapshot(target));
        } catch {
          // Skip symbols that fail to load this cycle.
        }
      }),
    );

    let triggered = 0;
    const now = new Date();

    for (const alert of active) {
      const key = `${alert.symbol}:${alert.marketType}`;
      const snapshot = snapshots.get(key);
      alert.lastCheckedAt = now;

      if (!snapshot) {
        await alert.save();
        continue;
      }

      let matched = false;
      switch (alert.type) {
        case "price_above":
          matched =
            alert.targetPrice != null && snapshot.price >= alert.targetPrice;
          break;
        case "price_below":
          matched =
            alert.targetPrice != null && snapshot.price <= alert.targetPrice;
          break;
        case "entry_zone":
          matched =
            snapshot.entryZone !== undefined &&
            snapshot.price >= snapshot.entryZone[0] &&
            snapshot.price <= snapshot.entryZone[1];
          break;
        case "verdict_enter":
          matched = snapshot.isEnter === true;
          break;
      }

      if (matched) {
        alert.status = "triggered";
        alert.triggeredAt = now;
        alert.message = buildTriggerMessage(
          alert.type as AlertType,
          alert.symbol,
          Number(snapshot.price.toFixed(4)),
        );
        triggered += 1;
      }

      await alert.save();
    }

    return triggered;
  } finally {
    evaluating = false;
  }
}
