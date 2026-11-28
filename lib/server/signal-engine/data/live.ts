/**
 * Live MarketData provider (Binance USDT-M futures, REST).
 *
 * Runs every minute, so it avoids re-downloading what cannot have changed: 4H / 1H / 15m
 * candles and 15m OI are cached until their next candle closes. Per minute only the 5m
 * klines (current price + forming candle) are always fetched; the funding map and the
 * 24h tickers are one request each.
 */
import {
  getAll24hrTickers,
  getAllFundingRates,
  getCryptoFuturesSymbols,
  getKlines,
  getOpenInterestHist,
} from "../../services/binance.service";
import type { Candle } from "../../types/index";
import type { EngineConfig } from "../config";
import type { MarketData, OiPoint } from "../types";

const TF_MS: Record<string, number> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };

const closedCache = new Map<string, { candles: Candle[]; validUntil: number }>();
const oiCache = new Map<string, { points: OiPoint[]; validUntil: number }>();

/** Closed candles only, cached until the next candle of `tf` closes. */
async function closedCandles(symbol: string, tf: string, count: number, now: number): Promise<Candle[]> {
  const key = `${symbol}:${tf}:${count}`;
  const hit = closedCache.get(key);
  if (hit && now < hit.validUntil) return hit.candles;
  const raw = await getKlines(symbol, tf, count + 1, "futures");
  const candles = raw.filter((c) => c.closeTime <= now).slice(-count);
  const lastClose = candles.at(-1)?.closeTime ?? now;
  closedCache.set(key, { candles, validUntil: lastClose + TF_MS[tf]! });
  return candles;
}

async function openInterest(symbol: string, points: number, now: number): Promise<OiPoint[]> {
  const hit = oiCache.get(symbol);
  if (hit && now < hit.validUntil) return hit.points;
  try {
    const list = await getOpenInterestHist(symbol, "15m", points);
    oiCache.set(symbol, { points: list, validUntil: Math.floor(now / 900_000) * 900_000 + 900_000 + 30_000 });
    return list;
  } catch {
    return hit?.points ?? []; // OI is optional data: strategies treat missing OI as "condition false"
  }
}

export interface UniverseItem {
  symbol: string;
  volume24hUsd: number;
}

export async function loadUniverse(cfg: EngineConfig): Promise<UniverseItem[]> {
  const [tickers, crypto] = await Promise.all([getAll24hrTickers("futures"), getCryptoFuturesSymbols()]);
  const exclude = new Set(cfg.universe.exclude);
  return tickers
    .filter((t) => t.symbol.endsWith("USDT") && crypto.has(t.symbol) && !exclude.has(t.symbol))
    .filter((t) => t.quoteVolume >= cfg.universe.minQuoteVolumeUsd)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, cfg.universe.maxSymbols)
    .map((t) => ({ symbol: t.symbol, volume24hUsd: t.quoteVolume }));
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function loadLiveMarketData(
  universe: UniverseItem[],
  cfg: EngineConfig,
  now: number = Date.now(),
): Promise<{ data: MarketData[]; errors: string[] }> {
  const errors: string[] = [];
  const h = cfg.history;
  const [funding, btc1h] = await Promise.all([
    getAllFundingRates().catch((e: unknown) => {
      errors.push(`funding: ${e instanceof Error ? e.message : String(e)}`);
      return new Map<string, number>();
    }),
    closedCandles("BTCUSDT", "1h", h["1h"], now),
  ]);

  const results = await mapLimit(universe, cfg.universe.fetchConcurrency, async (u): Promise<MarketData | null> => {
    try {
      const [c4h, c1h, c15m, raw5m, oi] = await Promise.all([
        closedCandles(u.symbol, "4h", h["4h"], now),
        closedCandles(u.symbol, "1h", h["1h"], now),
        closedCandles(u.symbol, "15m", h["15m"], now),
        getKlines(u.symbol, "5m", h["5m"] + 1, "futures"),
        openInterest(u.symbol, h.oiPoints, now),
      ]);
      const forming = raw5m.at(-1);
      if (!forming || c15m.length < 50) return null;
      return {
        symbol: u.symbol,
        now,
        price: forming.close,
        c4h,
        c1h,
        c15m,
        c5m: raw5m.filter((c) => c.closeTime <= now),
        oi,
        funding: funding.get(u.symbol) ?? null,
        volume24hUsd: u.volume24hUsd,
        btc1h,
      };
    } catch (error) {
      errors.push(`${u.symbol}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });

  return { data: results.filter((x): x is MarketData => x !== null), errors };
}
