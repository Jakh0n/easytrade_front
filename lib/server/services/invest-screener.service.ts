import { getAll24hrTickers } from "./binance.service";
import { buildInvestAnalysis } from "./invest.service";
import { getBtcTrend } from "./market.service";
import type {
  InvestHorizon,
  InvestScreenerCoinResult,
  InvestScreenerResponse,
  InvestVerdict,
  Trend,
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
const MIN_QUOTE_VOLUME = 500_000;
const MAX_SCAN = 80;
const CONCURRENCY = 4;
const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_DELAY_MS = 150;
const SCREENER_CAPITAL = 100;

let cache: {
  key: string;
  data: InvestScreenerResponse;
  expiresAt: number;
} | null = null;

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
 * Ranks long-term setups: invest score dominates, with bonuses for an
 * accumulate verdict, a healthy discount off the 52w high, and bullish trend.
 */
export function computeInvestOpportunityScore(params: {
  score: number;
  verdict: InvestVerdict;
  drawdownFromHigh: number;
  trend: Trend;
  topTargetUpside: number;
}): number {
  let total = params.score;

  if (params.verdict === "accumulate") {
    total += 12;
  } else if (params.verdict === "dca_wait") {
    total += 4;
  }

  if (params.trend === "bullish") {
    total += 8;
  } else if (params.trend === "neutral") {
    total += 3;
  }

  if (params.drawdownFromHigh >= 10 && params.drawdownFromHigh <= 45) {
    total += 6;
  }

  total += Math.min(15, params.topTargetUpside * 0.3);

  return Math.round(total);
}

async function scanSymbol(
  symbol: string,
  priceChangePercent: number,
  quoteVolume: number,
  horizon: InvestHorizon,
  btcTrend: Trend,
): Promise<InvestScreenerCoinResult | null> {
  try {
    const analysis = await buildInvestAnalysis(
      symbol,
      SCREENER_CAPITAL,
      horizon,
      { btcTrend },
    );

    if (analysis.verdict === "avoid") {
      return null;
    }

    const topTargetUpside =
      analysis.targets.length > 0
        ? Math.max(...analysis.targets.map((target) => target.upsidePercent))
        : 0;

    return {
      symbol: analysis.symbol,
      currentPrice: analysis.currentPrice,
      priceChangePercent,
      quoteVolume,
      horizon: analysis.horizon,
      horizonLabel: analysis.horizonLabel,
      verdict: analysis.verdict,
      verdictLabel: analysis.verdictLabel,
      score: analysis.score,
      reason: analysis.reason,
      trend: analysis.trend,
      weeklyRsi: analysis.weeklyRsi,
      drawdownFromHigh: analysis.drawdownFromHigh,
      topTargetUpside,
      opportunityScore: computeInvestOpportunityScore({
        score: analysis.score,
        verdict: analysis.verdict,
        drawdownFromHigh: analysis.drawdownFromHigh,
        trend: analysis.trend,
        topTargetUpside,
      }),
    };
  } catch {
    return null;
  }
}

export async function runInvestScreener(
  horizon: InvestHorizon = "3_6",
  limit: number = RESULT_LIMIT,
): Promise<InvestScreenerResponse> {
  const cacheKey = `invest:${horizon}:${limit}`;

  if (cache && cache.key === cacheKey && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const [tickers, btcRegime] = await Promise.all([
    getAll24hrTickers("spot"),
    getBtcTrend("1d", "spot"),
  ]);

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
      horizon,
      btcRegime.trend,
    ),
  );

  const coins = scanned
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, limit);

  const response: InvestScreenerResponse = {
    scanned: candidates.length,
    horizon,
    btcTrend: btcRegime.trend,
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
