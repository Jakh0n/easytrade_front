import { getKlines } from "./binance.service";
import { calculateEMA, calculateRSI } from "./indicators.service";
import { determineTrend } from "./risk.service";
import type { MarketType, TradeSide, Trend } from "../types/index";

const HTF_MAP: Record<string, string> = {
  "15m": "4h",
  "1h": "4h",
  "4h": "1d",
  "1d": "1w",
  "1w": "1w",
};

const HTF_KLINE_LIMIT = 250;

export interface MtfContext {
  htfInterval: string;
  htfTrend: Trend;
  aligned: boolean;
  confluence: number;
  note: string;
}

export function higherTimeframe(interval: string): string {
  return HTF_MAP[interval] ?? "1d";
}

function lastFinite(values: number[]): number {
  const value = values[values.length - 1];
  return value !== undefined && Number.isFinite(value) ? value : NaN;
}

export async function getHigherTimeframeTrend(
  symbol: string,
  htfInterval: string,
  marketType: MarketType,
): Promise<Trend> {
  const candles = await getKlines(
    symbol,
    htfInterval,
    HTF_KLINE_LIMIT,
    marketType,
  );
  const closes = candles.map((candle) => candle.close);
  const price = closes[closes.length - 1];

  if (price === undefined) {
    return "neutral";
  }

  const ema50 = lastFinite(calculateEMA(closes, 50));
  const ema200 = lastFinite(calculateEMA(closes, 200));

  return determineTrend(ema50, ema200, price);
}

function desiredTrendForSide(side: TradeSide): Trend | null {
  if (side === "long") {
    return "bullish";
  }
  if (side === "short") {
    return "bearish";
  }
  return null;
}

/**
 * Scores how well the entry timeframe and the higher timeframe agree with the
 * proposed trade direction. `aligned` is false only when the HTF actively
 * opposes the trade, which callers use to downgrade an `enter` to `wait`.
 */
export function computeConfluence(
  side: TradeSide,
  entryTrend: Trend,
  htfTrend: Trend,
  htfInterval: string,
): MtfContext {
  const desired = desiredTrendForSide(side);
  let score = 50;
  let aligned = true;
  let note: string;

  if (desired) {
    const opposite: Trend = desired === "bullish" ? "bearish" : "bullish";

    score += entryTrend === desired ? 25 : entryTrend === opposite ? -25 : 0;

    if (htfTrend === desired) {
      score += 25;
      note = `${htfInterval} trend signal bilan mos`;
    } else if (htfTrend === opposite) {
      score -= 30;
      aligned = false;
      note = `${htfInterval} trend qarama-qarshi — ehtiyot bo'ling`;
    } else {
      note = `${htfInterval} trend neytral`;
    }
  } else {
    if (entryTrend === htfTrend && entryTrend !== "neutral") {
      score += 25;
      note = `Timeframe'lar mos (${htfInterval})`;
    } else {
      note = `${htfInterval} trend: ${htfTrend}`;
    }
  }

  return {
    htfInterval,
    htfTrend,
    aligned,
    confluence: Math.round(Math.min(100, Math.max(0, score))),
    note,
  };
}
