import { buildEmaSmcAnalysis } from "./ema-smc.strategy.service";
import { getAll24hrTickers } from "./binance.service";
import type {
  EmaSmcScreenerCoinResult,
  EmaSmcScreenerResponse,
  MarketType,
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

const RESULT_LIMIT = 15;
const MIN_QUOTE_VOLUME = 100_000;
const MAX_SCAN = 100;
const CONCURRENCY = 4;
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_DELAY_MS = 150;

let cache: {
  key: string;
  data: EmaSmcScreenerResponse;
  expiresAt: number;
} | null = null;

function isScannableSymbol(symbol: string): boolean {
  if (!symbol.endsWith("USDT")) return false;
  if (EXCLUDED_SYMBOLS.has(symbol)) return false;
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
      if (result) results.push(result);
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

export function computeEmaSmcOpportunityScore(params: {
  score: number;
  verdict: EmaSmcScreenerCoinResult["verdict"];
  riskReward: number;
  hasSweep: boolean;
  hasStructure: boolean;
  quoteVolume: number;
}): number {
  let total = params.score;

  if (params.verdict === "enter") total += 15;
  else if (params.verdict === "wait") total += 5;

  if (params.hasSweep) total += 10;
  if (params.hasStructure) total += 8;
  total += Math.min(12, params.riskReward * 3);

  if (params.quoteVolume > 5_000_000) total += 5;
  else if (params.quoteVolume > 1_000_000) total += 3;

  return Math.round(total);
}

async function scanSymbol(
  symbol: string,
  priceChangePercent: number,
  quoteVolume: number,
  marketType: MarketType,
): Promise<EmaSmcScreenerCoinResult | null> {
  try {
    const analysis = await buildEmaSmcAnalysis(symbol, marketType);

    if (analysis.verdict === "avoid") return null;

    return {
      symbol: analysis.symbol,
      currentPrice: analysis.currentPrice,
      priceChangePercent,
      quoteVolume,
      side: analysis.side,
      verdict: analysis.verdict,
      verdictLabel: analysis.verdictLabel,
      score: analysis.score,
      reason: analysis.reason,
      trendDirection: analysis.trendDirection,
      riskReward: analysis.riskReward,
      entryType: analysis.entryType,
      stopLoss: analysis.stopLoss,
      takeProfit: analysis.takeProfit,
      sweep: analysis.sweep,
      structure: analysis.structure,
      opportunityScore: computeEmaSmcOpportunityScore({
        score: analysis.score,
        verdict: analysis.verdict,
        riskReward: analysis.riskReward,
        hasSweep: analysis.sweep !== null,
        hasStructure: analysis.structure !== null,
        quoteVolume,
      }),
    };
  } catch {
    return null;
  }
}

export async function runEmaSmcScreener(
  marketType: MarketType = "futures",
  limit: number = RESULT_LIMIT,
): Promise<EmaSmcScreenerResponse> {
  const cacheKey = `ema_smc:${marketType}:${limit}`;

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
      marketType,
    ),
  );

  const coins = scanned
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, limit);

  const response: EmaSmcScreenerResponse = {
    strategyId: "ema_smc",
    scanned: candidates.length,
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
