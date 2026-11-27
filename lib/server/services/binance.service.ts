import axios, { isAxiosError } from "axios";
import { AppError } from "../utils/AppError";
import type {
  BinanceFundingRateRaw,
  BinanceKlineRaw,
  BinanceTicker24hrRaw,
  Candle,
  FundingRate,
  MarketType,
  Ticker24hr,
} from "../types/index";

const SPOT_BASE_URL = "https://api.binance.com";
const FUTURES_BASE_URL = "https://fapi.binance.com";

function getBaseUrl(marketType: MarketType): string {
  return marketType === "futures" ? FUTURES_BASE_URL : SPOT_BASE_URL;
}

function getKlinesPath(marketType: MarketType): string {
  return marketType === "futures" ? "/fapi/v1/klines" : "/api/v3/klines";
}

function getTickerPath(marketType: MarketType): string {
  return marketType === "futures"
    ? "/fapi/v1/ticker/24hr"
    : "/api/v3/ticker/24hr";
}

function handleBinanceError(error: unknown): never {
  if (isAxiosError(error)) {
    const status = error.response?.status;

    if (status === 400) {
      throw new Error("Symbol topilmadi yoki noto'g'ri");
    }

    // 429 = rate limit exceeded, 418 = IP auto-banned for ignoring limits.
    if (status === 429 || status === 418) {
      const retryAfter = error.response?.headers?.["retry-after"];
      const waitText = retryAfter ? ` (~${retryAfter}s kuting)` : "";
      throw new AppError(
        `Binance so'rov limiti oshib ketdi, IP vaqtincha cheklangan${waitText}. Biroz kuting.`,
        503,
      );
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new AppError("Binance API ga ulanish vaqti tugadi", 503);
    }

    if (!error.response) {
      throw new AppError(
        "Binance API ga ulanib bo'lmadi. Tarmoq xatosini tekshiring",
        503,
      );
    }

    if (status === 451) {
      throw new AppError(
        "Binance API mintaqangizda cheklangan. Server regionini sin1/hnd1 ga o'rnating.",
        503,
      );
    }

    throw new AppError(
      `Binance API xatosi: ${error.response.status} ${error.response.statusText}`,
      502,
    );
  }

  throw new AppError("Kutilmagan xato yuz berdi", 500);
}

/**
 * Short-lived in-memory cache for public market data. Analyze + AI summary +
 * screener frequently request the same klines within seconds, so caching avoids
 * hammering Binance and tripping its rate limits (429/418).
 */
const KLINES_TTL_MS = 30_000;
const TICKERS_TTL_MS = 30_000;

const klinesCache = new Map<string, { data: Candle[]; expiresAt: number }>();
const tickersCache = new Map<
  string,
  { data: Ticker24hr[]; expiresAt: number }
>();

function parseKline(raw: BinanceKlineRaw): Candle {
  return {
    openTime: raw[0],
    open: Number(raw[1]),
    high: Number(raw[2]),
    low: Number(raw[3]),
    close: Number(raw[4]),
    volume: Number(raw[5]),
    closeTime: raw[6],
    takerBuyVolume: raw[9] !== undefined ? Number(raw[9]) : undefined,
  };
}

function parseTicker(raw: BinanceTicker24hrRaw): Ticker24hr {
  return {
    symbol: raw.symbol,
    lastPrice: Number(raw.lastPrice),
    priceChangePercent: Number(raw.priceChangePercent),
    volume: Number(raw.volume),
    quoteVolume: Number(raw.quoteVolume),
  };
}

export async function getKlines(
  symbol: string,
  interval: string,
  limit: number = 300,
  marketType: MarketType = "spot",
): Promise<Candle[]> {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = `${marketType}:${normalizedSymbol}:${interval}:${limit}`;
  const cached = klinesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const { data } = await axios.get<BinanceKlineRaw[]>(
      `${getBaseUrl(marketType)}${getKlinesPath(marketType)}`,
      {
        params: { symbol: normalizedSymbol, interval, limit },
        timeout: 10_000,
      },
    );

    const candles = data.map(parseKline);
    klinesCache.set(cacheKey, {
      data: candles,
      expiresAt: Date.now() + KLINES_TTL_MS,
    });
    return candles;
  } catch (error) {
    handleBinanceError(error);
  }
}

/** Highest `limit` each venue accepts for a single klines request. */
export const MAX_KLINES_PER_REQUEST: Record<MarketType, number> = {
  spot: 1000,
  futures: 1500,
};

/** Highest `limit` the futures funding-rate endpoint accepts. */
export const MAX_FUNDING_PER_REQUEST = 1000;

/**
 * One page of historical klines starting at `startTime`. Deliberately uncached:
 * range requests are used to build multi-year datasets, and caching thousands of
 * distinct pages would only grow memory without ever being reused.
 */
export async function getKlinesRange(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
  marketType: MarketType = "futures",
): Promise<Candle[]> {
  try {
    const { data } = await axios.get<BinanceKlineRaw[]>(
      `${getBaseUrl(marketType)}${getKlinesPath(marketType)}`,
      {
        params: {
          symbol: symbol.toUpperCase(),
          interval,
          startTime,
          endTime,
          limit: MAX_KLINES_PER_REQUEST[marketType],
        },
        timeout: 20_000,
      },
    );

    return data.map(parseKline);
  } catch (error) {
    handleBinanceError(error);
  }
}

/**
 * One page of realised funding settlements (futures only). Funding is a real
 * holding cost on perpetuals, so a backtest that ignores it overstates every
 * trade that stays open across a settlement.
 */
export async function getFundingRateRange(
  symbol: string,
  startTime: number,
  endTime: number,
): Promise<FundingRate[]> {
  try {
    const { data } = await axios.get<BinanceFundingRateRaw[]>(
      `${FUTURES_BASE_URL}/fapi/v1/fundingRate`,
      {
        params: {
          symbol: symbol.toUpperCase(),
          startTime,
          endTime,
          limit: MAX_FUNDING_PER_REQUEST,
        },
        timeout: 20_000,
      },
    );

    return data.map((item) => ({
      fundingTime: item.fundingTime,
      rate: Number(item.fundingRate),
    }));
  } catch (error) {
    handleBinanceError(error);
  }
}

export async function get24hrTicker(
  symbol: string,
  marketType: MarketType = "spot",
): Promise<Ticker24hr> {
  try {
    const { data } = await axios.get<BinanceTicker24hrRaw>(
      `${getBaseUrl(marketType)}${getTickerPath(marketType)}`,
      {
        params: { symbol: symbol.toUpperCase() },
        timeout: 10_000,
      },
    );

    return parseTicker(data);
  } catch (error) {
    handleBinanceError(error);
  }
}

export async function getAll24hrTickers(
  marketType: MarketType = "spot",
): Promise<Ticker24hr[]> {
  const cached = tickersCache.get(marketType);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const { data } = await axios.get<BinanceTicker24hrRaw[]>(
      `${getBaseUrl(marketType)}${getTickerPath(marketType)}`,
      { timeout: 15_000 },
    );

    const tickers = data.map(parseTicker);
    tickersCache.set(marketType, {
      data: tickers,
      expiresAt: Date.now() + TICKERS_TTL_MS,
    });
    return tickers;
  } catch (error) {
    handleBinanceError(error);
  }
}

interface FuturesExchangeInfoRaw {
  symbols: { symbol: string; underlyingType?: string; contractType?: string; status?: string }[];
}

const CRYPTO_SYMBOLS_TTL_MS = 60 * 60_000;
let cryptoSymbolsCache: { data: Set<string>; expiresAt: number } | null = null;

/**
 * Futures'dagi faqat kripto perpetual juftliklar (`underlyingType: "COIN"`).
 * Binance endi metall, neft, aksiya ("TradFi": XAU, XAG, BZ, NVDA, DELL...) ham sotadi —
 * strategiyalar ularda sinalmagan. Xato bo'lsa eski kesh qaytariladi.
 */
export async function getCryptoFuturesSymbols(): Promise<Set<string>> {
  if (cryptoSymbolsCache && cryptoSymbolsCache.expiresAt > Date.now()) {
    return cryptoSymbolsCache.data;
  }
  try {
    const { data } = await axios.get<FuturesExchangeInfoRaw>(
      `${FUTURES_BASE_URL}/fapi/v1/exchangeInfo`,
      { timeout: 15_000 },
    );
    const symbols = new Set(
      data.symbols
        .filter((s) => s.underlyingType === "COIN" && s.contractType === "PERPETUAL" && s.status === "TRADING")
        .map((s) => s.symbol),
    );
    cryptoSymbolsCache = { data: symbols, expiresAt: Date.now() + CRYPTO_SYMBOLS_TTL_MS };
    return symbols;
  } catch (error) {
    if (cryptoSymbolsCache) return cryptoSymbolsCache.data;
    handleBinanceError(error);
  }
}
