import { getAll24hrTickers, getCryptoFuturesSymbols } from "./binance.service";
import { FQ_PROFILES, buildFqAnalysis, type FqStrategyId } from "./fq.strategy.service";
import type {
  FqScanCoin,
  FqScanResponse,
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
  "USDEUSDT",
  "XUSDUSDT",
]);

const MAX_SCAN = 100;
const MIN_QUOTE_VOLUME = 5_000_000;
const CONCURRENCY = 6;
const CACHE_TTL_MS = 3 * 60 * 1000;

const VERDICT_ORDER = { enter: 0, wait: 1, avoid: 2 } as const;

const cache = new Map<string, { data: FqScanResponse; expiresAt: number }>();

export function isScannableSymbol(symbol: string): boolean {
  if (!symbol.endsWith("USDT") || EXCLUDED_SYMBOLS.has(symbol)) return false;
  return !/(UP|DOWN|BEAR|BULL)USDT$/.test(symbol);
}

export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor]!;
      cursor += 1;
      const result = await worker(item);
      if (result) results.push(result);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, next),
  );
  return results;
}

export function sortScanCoins(coins: FqScanCoin[]): FqScanCoin[] {
  return [...coins].sort(
    (a, b) =>
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      (a.signalBarsAgo ?? 99) - (b.signalBarsAgo ?? 99) ||
      b.score - a.score ||
      b.quoteVolume - a.quoteVolume,
  );
}

/**
 * Eng likvid USDT juftliklarini FQ v3 bo'yicha skanerlaydi.
 * Natijada barcha coinlar (avoid ham) bor — UI va signal servisi o'zi filtrlaydi.
 */
export async function runFqScan(
  marketType: MarketType = "futures",
  options: { fresh?: boolean; strategy?: FqStrategyId } = {},
): Promise<FqScanResponse> {
  const strategy = options.strategy ?? "fq_v3";
  const profile = FQ_PROFILES[strategy];
  const cacheKey = `${strategy}:${marketType}`;
  const cached = cache.get(cacheKey);
  if (!options.fresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [tickers, crypto] = await Promise.all([
    getAll24hrTickers(marketType),
    // Spot'da TradFi yo'q; futures'da faqat kripto (metall/neft/aksiyalar chiqariladi).
    marketType === "futures" ? getCryptoFuturesSymbols() : Promise.resolve(null),
  ]);
  const universe = tickers
    .filter(
      (t) =>
        isScannableSymbol(t.symbol) &&
        t.quoteVolume >= MIN_QUOTE_VOLUME &&
        (!crypto || crypto.has(t.symbol)) &&
        (!profile.symbols || profile.symbols.includes(t.symbol)),
    )
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, MAX_SCAN);

  const coins = await runPool(universe, CONCURRENCY, async (ticker) => {
    try {
      const analysis = await buildFqAnalysis(ticker.symbol, marketType, strategy);
      const coin: FqScanCoin = {
        ...analysis,
        priceChangePercent: ticker.priceChangePercent,
        quoteVolume: ticker.quoteVolume,
      };
      return coin;
    } catch {
      return null;
    }
  });

  const stats = {
    enter: coins.filter((c) => c.verdict === "enter").length,
    wait: coins.filter((c) => c.verdict === "wait").length,
    avoid: coins.filter((c) => c.verdict === "avoid").length,
    longBias: coins.filter((c) => c.trend === "up").length,
    shortBias: coins.filter((c) => c.trend === "down").length,
  };

  const response: FqScanResponse = {
    marketType,
    scanned: universe.length,
    updatedAt: new Date().toISOString(),
    coins: sortScanCoins(coins),
    stats,
  };

  cache.set(cacheKey, { data: response, expiresAt: Date.now() + CACHE_TTL_MS });
  return response;
}
