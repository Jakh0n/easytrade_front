import axios, { isAxiosError } from "axios";
import { AppError } from "../utils/AppError";
import type {
  BinanceKlineRaw,
  BinanceTicker24hrRaw,
  Candle,
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
      throw new Error("Binance API ga ulanish vaqti tugadi");
    }

    if (!error.response) {
      throw new Error(
        "Binance API ga ulanib bo'lmadi. Tarmoq xatosini tekshiring",
      );
    }

    throw new Error(
      `Binance API xatosi: ${error.response.status} ${error.response.statusText}`,
    );
  }

  throw new Error("Kutilmagan xato yuz berdi");
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
