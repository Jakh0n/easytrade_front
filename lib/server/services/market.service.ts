import { getKlines } from "./binance.service";
import { calculateEMA } from "./indicators.service";
import { determineTrend } from "./risk.service";
import type { MarketType, Trend } from "../types/index";

const BTC_SYMBOL = "BTCUSDT";
const BTC_KLINE_LIMIT = 250;
const CACHE_TTL_MS = 60 * 1000;

/** Symbols treated as BTC itself, so we never correlate BTC with BTC. */
export const BTC_SYMBOLS = new Set(["BTCUSDT", "BTCUSD", "BTCUSDC", "BTCFDUSD"]);

export interface BtcRegime {
  trend: Trend;
  changePercent: number;
}

const cache = new Map<string, { data: BtcRegime; expiresAt: number }>();

function lastFinite(values: number[]): number {
  const value = values[values.length - 1];
  return value !== undefined && Number.isFinite(value) ? value : NaN;
}

/**
 * Market regime proxy: BTC's trend on the same timeframe plus its recent price
 * change. Most alts correlate with BTC, so callers use this to gate altcoin
 * entries. Cached briefly since BTC's regime doesn't change candle-to-candle.
 */
export async function getBtcTrend(
  interval: string,
  marketType: MarketType,
): Promise<BtcRegime> {
  const key = `${marketType}:${interval}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const candles = await getKlines(
    BTC_SYMBOL,
    interval,
    BTC_KLINE_LIMIT,
    marketType,
  );
  const closes = candles.map((candle) => candle.close);
  const price = closes[closes.length - 1];

  if (price === undefined) {
    return { trend: "neutral", changePercent: 0 };
  }

  const ema50 = lastFinite(calculateEMA(closes, 50));
  const ema200 = lastFinite(calculateEMA(closes, 200));
  const trend = determineTrend(ema50, ema200, price);

  const prior = closes[closes.length - 6];
  const changePercent =
    prior !== undefined && prior > 0 ? ((price - prior) / prior) * 100 : 0;

  const data: BtcRegime = { trend, changePercent };
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });

  return data;
}
