import { buildTechnicalAnalysis } from "./analysis.service";
import { getAll24hrTickers } from "./binance.service";
import type {
  MarketType,
  ScreenerCoinResult,
  ScreenerResponse,
} from "../types/index";

const EXCLUDED_SYMBOLS = new Set([
  "USDCUSDT",
  "BUSDUSDT",
  "TUSDUSDT",
  "FDUSDUSDT",
  "DAIUSDT",
  "EURUSDT",
  "USDPUSDT",
]);

const DEFAULT_INTERVAL = "4h";
const RESULT_LIMIT = 20;
const MIN_QUOTE_VOLUME = 50_000;
// Only scan the most liquid pairs. Caps Binance API calls per scan (avoids
// 429/418 rate-limit bans) and matches the "strong volume first" ranking.
const MAX_SCAN = 150;
const CONCURRENCY = 5;
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_DELAY_MS = 120;

let cache: { key: string; data: ScreenerResponse; expiresAt: number } | null =
  null;

function isScannableSymbol(symbol: string): boolean {
  if (!symbol.endsWith("USDT")) {
    return false;
  }

  if (EXCLUDED_SYMBOLS.has(symbol)) {
    return false;
  }

  if (
    symbol.includes("UP") ||
    symbol.includes("DOWN") ||
    symbol.includes("BEAR") ||
    symbol.includes("BULL")
  ) {
    return false;
  }

  return true;
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function runWorker(): Promise<void> {
    while (index < items.length) {
      const current = items[index]!;
      index += 1;
      const result = await worker(current);
      if (result) {
        results.push(result);
      }
      if (REQUEST_DELAY_MS > 0) {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, runWorker),
  );

  return results;
}

/**
 * Ranks an actionable setup so the strongest, immediately-tradeable coins float
 * to the top: current volume surge dominates, then strategy confidence and the
 * live R:R (rrNow — what a trader entering right now actually gets).
 */
function computeOpportunityScore(
  volumeStatus: ScreenerCoinResult["volumeStatus"],
  confidence: number,
  rrNow: number,
): number {
  const volumeScore =
    volumeStatus === "high" ? 100 : volumeStatus === "normal" ? 40 : 0;
  return Math.round(volumeScore + confidence * 0.6 + rrNow * 6);
}

async function scanSymbol(
  symbol: string,
  priceChangePercent: number,
  quoteVolume: number,
  interval: string,
  marketType: MarketType,
): Promise<ScreenerCoinResult | null> {
  try {
    const analysis = await buildTechnicalAnalysis(
      symbol,
      interval,
      10_000,
      2,
      marketType,
      false,
    );

    if (analysis.verdict.verdict !== "enter") {
      return null;
    }

    const volumeStatus = analysis.indicators.volumeStatus;

    return {
      symbol: analysis.symbol,
      currentPrice: analysis.currentPrice,
      priceChangePercent,
      trend: analysis.trend,
      verdict: analysis.verdict.verdict,
      verdictLabel: analysis.verdict.verdictLabel,
      side: analysis.verdict.side,
      reason: analysis.verdict.reason,
      rrNow: analysis.verdict.rrNow,
      rrIdeal: analysis.verdict.rrIdeal,
      rsi: analysis.indicators.rsi,
      strategy: analysis.strategy,
      volumeStatus,
      quoteVolume,
      opportunityScore: computeOpportunityScore(
        volumeStatus,
        analysis.strategy.confidence,
        analysis.verdict.rrNow,
      ),
    };
  } catch {
    return null;
  }
}

export async function runMarketScreener(
  interval: string = DEFAULT_INTERVAL,
  limit: number = RESULT_LIMIT,
  marketType: MarketType = "spot",
): Promise<ScreenerResponse> {
  const cacheKey = `full:${marketType}:${interval}:${limit}`;

  if (cache && cache.key === cacheKey && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const tickers = await getAll24hrTickers(marketType);

  const eligible = tickers
    .filter(
      (ticker) =>
        isScannableSymbol(ticker.symbol) &&
        ticker.quoteVolume >= MIN_QUOTE_VOLUME,
    )
    .sort((a, b) => b.quoteVolume - a.quoteVolume);

  const candidates = eligible.slice(0, MAX_SCAN);

  const scanned = await runPool(candidates, CONCURRENCY, (ticker) =>
    scanSymbol(
      ticker.symbol,
      ticker.priceChangePercent,
      ticker.quoteVolume,
      interval,
      marketType,
    ),
  );

  const coins = scanned
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, limit);

  const response: ScreenerResponse = {
    scanned: candidates.length,
    interval,
    marketType,
    updatedAt: new Date().toISOString(),
    coins,
  };

  cache = {
    key: cacheKey,
    data: response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return response;
}
