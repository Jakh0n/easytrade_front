import { env } from "../config/env";
import { getKlines } from "./binance.service";
import {
  REGIME_ALT_BASKET,
  computeRegime,
  describeRegime,
  regimeAllows,
  type RegimeBar,
  type RegimeRule,
} from "./market-regime/engine";
import type { Candle, MarketType, StrategyId } from "../types/index";

/**
 * Har strategiya uchun bozor rejimi filtri — `scripts/regime-backtest.ts` natijasi bo'yicha tanlangan
 * (EMA 200, train va test davrlarining ikkalasida ham yaxshilagan, EMA 100 da ham tasdiqlangan variant).
 */
export const REGIME_FILTERS: Record<StrategyId, { rule: RegimeRule; tf: string }> = {
  /** BTC 4H EMA200 tomoniga. */
  fq_v3: { rule: "btc", tf: "4h" },
  /** Altlar: TOTAL3 ▲ va BTC.D ▼ (alt season) bo'lsa LONG; BTC/ETH — o'z 1D trendi. */
  fq_4h: { rule: "dom", tf: "1d" },
  /** TOTAL3 1D EMA200 tomoniga. */
  smc_4h: { rule: "alt", tf: "1d" },
  /** SMC 5M o'z 4H trend qoidasini ishlatadi — rejim filtri chaqirilmaydi. */
  smc_5m: { rule: "btc", tf: "4h" },
  /** SMC MTF ham o'z 4H trend qoidasini ishlatadi — rejim filtri chaqirilmaydi. */
  smc_mtf: { rule: "btc", tf: "4h" },
};

const LIMIT = 500;

const cache = new Map<string, { bar: RegimeBar | null; expiresAt: number }>();

const closed = (candles: Candle[]) => candles.filter((c) => c.closeTime <= Date.now());

/** Berilgan timeframe'dagi oxirgi yopilgan rejim qatori (1 daqiqa kesh). */
export async function getCurrentRegime(tf: string, market: MarketType = "futures"): Promise<RegimeBar | null> {
  const key = `${market}:${tf}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.bar;

  const symbols = ["BTCUSDT", "ETHUSDT", ...REGIME_ALT_BASKET];
  const results = await Promise.all(
    symbols.map((s) => getKlines(s, tf, LIMIT, market).then(closed).catch(() => [] as Candle[])),
  );
  const [btc, eth, ...alts] = results;
  const bars = computeRegime(btc!, eth!, alts.filter((a) => a.length > 0));
  const bar = bars.at(-1) ?? null;
  cache.set(key, { bar, expiresAt: Date.now() + 60_000 });
  return bar;
}

export interface RegimeGate {
  allows: (side: "long" | "short", symbol: string) => boolean;
  /** Telegram xabari uchun: "BTC ▲ · TOTAL3 ▲ · BTC.D ▼ · breadth 65%". */
  summary: string | null;
}

/**
 * Strategiya uchun filtr. Filtr o'chiq bo'lsa yoki rejim ma'lumotini olib bo'lmasa — hamma signal o'tadi
 * (bozor ma'lumoti xatosi signallarni to'xtatib qo'ymasin), xato `errors` ga yoziladi.
 */
export async function getRegimeGate(strategy: StrategyId, market: MarketType, errors: string[]): Promise<RegimeGate> {
  if (!env.MARKET_REGIME_FILTER_ENABLED) return { allows: () => true, summary: null };
  const { rule, tf } = REGIME_FILTERS[strategy];
  try {
    const bar = await getCurrentRegime(tf, market);
    return {
      allows: (side, symbol) => regimeAllows(rule, bar, side, symbol),
      summary: bar ? `${tf.toUpperCase()} · ${describeRegime(bar)}` : null,
    };
  } catch (error) {
    errors.push(`Bozor rejimi ${strategy}: ${error instanceof Error ? error.message : String(error)}`);
    return { allows: () => true, summary: null };
  }
}
