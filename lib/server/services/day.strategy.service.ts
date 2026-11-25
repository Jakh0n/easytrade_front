import { getAll24hrTickers, getKlines } from "./binance.service";
import { DAY_CONFIG, computeDayBias, computeSupertrend } from "./day-strategy/engine";
import { runPool } from "./fq-scanner.service";
import type { Candle, DayAnalysis, DayScanResponse, MarketType, Ticker24hr } from "../types/index";

const LIMIT = 500;
/**
 * Backtest aynan shu coinlarda qilingan. Futures'dagi eng katta hajmli juftliklar orasida
 * endi tokenlashtirilgan aksiya/metallar (XAU, NVDA...) ham bor — ular sinalmagan, shuning uchun
 * hajm bo'yicha emas, ro'yxat bo'yicha skanerlanadi.
 */
export const DAY_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "SUIUSDT",
] as const;
const DAY_SYMBOL_SET = new Set<string>(DAY_SYMBOLS);
/** Flip shuncha sham ichida bo'lsa "kirish" deb ko'rsatiladi (signal servisi faqat 0 ni yuboradi). */
const FRESH_BARS = 1;
const FLIP_LOOKBACK = 96;
const CACHE_TTL_MS = 60_000;

const cache = new Map<MarketType, { data: DayScanResponse; expiresAt: number }>();

function closedCandles(candles: Candle[]): Candle[] {
  const last = candles.at(-1);
  return last && last.closeTime > Date.now() ? candles.slice(0, -1) : candles;
}

export function buildDayFromCandles(
  symbol: string,
  marketType: MarketType,
  candles: Candle[],
  htfCandles: Candle[],
  ticker: Pick<Ticker24hr, "priceChangePercent" | "quoteVolume"> = { priceChangePercent: 0, quoteVolume: 0 },
): DayAnalysis {
  const htfBias = computeDayBias(htfCandles);
  const { dir, line } = computeSupertrend(candles);
  const last = candles.length - 1;
  const price = candles.at(-1)?.close ?? 0;
  const lastDir = dir[last] ?? 0;
  const stLine = line[last] ?? NaN;

  let side: DayAnalysis["side"] = htfBias === "bullish" ? "long" : htfBias === "bearish" ? "short" : null;
  if (side === "short" && marketType !== "futures") side = null;

  const base: DayAnalysis = {
    strategyId: "st_day",
    symbol: symbol.toUpperCase(),
    marketType,
    currentPrice: price,
    timeframe: DAY_CONFIG.interval,
    htfTimeframe: DAY_CONFIG.htfInterval,
    htfBias,
    stDir: lastDir === 1 ? "up" : lastDir === -1 ? "down" : null,
    stLine: Number.isFinite(stLine) ? stLine : 0,
    flipBarsAgo: null,
    side,
    verdict: "avoid",
    reason: "",
    signalTime: null,
    entry: 0,
    stopLoss: 0,
    currentR: null,
    riskPercent: DAY_CONFIG.riskPct,
    priceChangePercent: ticker.priceChangePercent,
    quoteVolume: ticker.quoteVolume,
    generatedAt: new Date().toISOString(),
  };

  if (!lastDir || !Number.isFinite(stLine)) {
    return { ...base, reason: "Indikatorlar uchun ma'lumot yetarli emas" };
  }
  if (!htfBias) {
    return { ...base, reason: "1H trend aniq emas (EMA 50/200 mos emas) — day trade yo'q" };
  }
  if (!side) {
    return { ...base, reason: "Spot bozorda short yo'q — 1H trend pastga" };
  }

  const d = side === "long" ? 1 : -1;
  if (lastDir !== d) {
    return {
      ...base,
      verdict: "wait",
      reason: `1H trend ${side === "long" ? "yuqoriga" : "pastga"}, Supertrend hali teskari — ${side === "long" ? "yuqoriga" : "pastga"} flipni kuting`,
    };
  }

  // Joriy trend bo'lagining boshlanishi (flip) — shu yerda kirilgan bo'lardi.
  let flip = -1;
  for (let k = last; k > Math.max(0, last - FLIP_LOOKBACK); k--) {
    if (dir[k] !== d) break;
    if (dir[k - 1] === -d) {
      flip = k;
      break;
    }
  }

  if (flip < 0) {
    return {
      ...base,
      verdict: "wait",
      reason: "Savdo 24 soatdan oldin boshlangan — kech kirmang, keyingi flipni kuting",
    };
  }

  const entry = candles[flip]!.close;
  const stopLoss = line[flip]!;
  const risk = Math.abs(entry - stopLoss);
  const flipBarsAgo = last - flip;
  const currentR = risk > 0 ? (d * (price - entry)) / risk : null;
  const fresh = flipBarsAgo <= FRESH_BARS;
  const sideLabel = side === "long" ? "LONG" : "SHORT";

  return {
    ...base,
    flipBarsAgo,
    signalTime: candles[flip]!.openTime,
    entry,
    stopLoss,
    currentR,
    verdict: fresh ? "enter" : "wait",
    reason: fresh
      ? `${sideLabel} — Supertrend 1H trend tomonga o'girildi${flipBarsAgo ? " (1 sham oldin)" : ""}. Stop Supertrend chizig'ida, chiqish teskari flipda.`
      : `${sideLabel} savdo ${flipBarsAgo} sham oldin boshlangan (${currentR !== null ? `${currentR >= 0 ? "+" : ""}${currentR.toFixed(2)}R` : "—"}) — kech kirmang, keyingi flipni kuting`,
  };
}

export async function buildDayAnalysis(
  symbol: string,
  marketType: MarketType = "futures",
  ticker?: Pick<Ticker24hr, "priceChangePercent" | "quoteVolume">,
): Promise<DayAnalysis> {
  const [raw, htfRaw] = await Promise.all([
    getKlines(symbol, DAY_CONFIG.interval, LIMIT, marketType),
    getKlines(symbol, DAY_CONFIG.htfInterval, LIMIT, marketType),
  ]);
  return buildDayFromCandles(symbol, marketType, closedCandles(raw), closedCandles(htfRaw), ticker);
}

/** Supertrend allaqachon 1H trend tomonda — savdo davom etmoqda (flip qachon bo'lganidan qat'i nazar). */
const inTrade = (c: DayAnalysis) =>
  c.verdict === "wait" && ((c.side === "long" && c.stDir === "up") || (c.side === "short" && c.stDir === "down"));

const ORDER = (c: DayAnalysis) => (c.verdict === "enter" ? 0 : inTrade(c) ? 1 : c.verdict === "wait" ? 2 : 3);

export async function runDayScan(
  marketType: MarketType = "futures",
  options: { fresh?: boolean } = {},
): Promise<DayScanResponse> {
  const cached = cache.get(marketType);
  if (!options.fresh && cached && cached.expiresAt > Date.now()) return cached.data;

  const tickers = await getAll24hrTickers(marketType);
  const universe = tickers
    .filter((t) => DAY_SYMBOL_SET.has(t.symbol))
    .sort((a, b) => b.quoteVolume - a.quoteVolume);

  const coins = await runPool(universe, 6, async (t) => {
    try {
      return await buildDayAnalysis(t.symbol, marketType, t);
    } catch {
      return null;
    }
  });
  coins.sort((a, b) => ORDER(a) - ORDER(b) || (a.flipBarsAgo ?? 999) - (b.flipBarsAgo ?? 999) || b.quoteVolume - a.quoteVolume);

  const response: DayScanResponse = {
    marketType,
    scanned: universe.length,
    updatedAt: new Date().toISOString(),
    coins,
    stats: {
      enter: coins.filter((c) => c.verdict === "enter").length,
      inTrade: coins.filter(inTrade).length,
      waiting: coins.filter((c) => c.verdict === "wait" && !inTrade(c)).length,
      avoid: coins.filter((c) => c.verdict === "avoid").length,
    },
  };
  cache.set(marketType, { data: response, expiresAt: Date.now() + CACHE_TTL_MS });
  return response;
}
