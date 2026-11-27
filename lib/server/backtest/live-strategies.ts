/**
 * Live'dagi 5 ta strategiyani (joriy sozlamalar + bozor rejimi filtri) tarixda o'ynatish uchun umumiy modul.
 * Research skriptlari (signal-research.ts) shu yerdan oladi — live bilan bir xil bo'lishi uchun
 * konfiguratsiyalar to'g'ridan-to'g'ri live modullaridan import qilinadi.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { backtestDay, backtestFq, type BacktestTrade } from "./fq-backtest";
import { SMC_CONFIG, backtestSmc } from "./smc-backtest";
import { FQ_PROFILES } from "../services/fq.strategy.service";
import { REGIME_FILTERS } from "../services/market-regime.service";
import { REGIME_ALT_BASKET, computeRegime, regimeAllows, regimeAt, type RegimeBar } from "../services/market-regime/engine";
import { DAY_SYMBOLS } from "../services/day.strategy.service";
import { SMC_SYMBOLS } from "../services/smc.service";
import { MAX_KLINES_PER_REQUEST, getKlinesRange } from "../services/binance.service";
import type { Candle, StrategyId } from "../types/index";

export const CACHE_DIR = path.join(process.cwd(), ".cache", "backtest");
export const INTERVAL_MS: Record<string, number> = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

export const CORE_20 = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "DOTUSDT",
  "LTCUSDT", "BCHUSDT", "NEARUSDT", "UNIUSDT", "AAVEUSDT", "ATOMUSDT", "FILUSDT", "ETCUSDT", "SUIUSDT", "TRXUSDT",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts - 1) throw error;
      await sleep(20_000 * (i + 1));
    }
  }
}

/** Kesh + Binance. Eski keshda taker hajmi bo'lmasa — to'liq qayta yuklanadi. */
export async function loadCandles(symbol: string, interval: string, start: number, end: number = Date.now()): Promise<Candle[]> {
  const file = path.join(CACHE_DIR, `${symbol}-${interval}.json`);
  let cached: Candle[] = [];
  try {
    cached = JSON.parse(await readFile(file, "utf8")) as Candle[];
  } catch {
    /* kesh yo'q */
  }
  const step = INTERVAL_MS[interval]!;
  const usable = cached.length > 0 && cached[0]!.openTime <= start + step && cached.at(-1)!.takerBuyVolume !== undefined;
  const have = usable ? cached : [];
  let cursor = have.length ? have.at(-1)!.openTime + step : start;
  const out = [...have];
  while (cursor < end - step) {
    const page = await withRetry(() => getKlinesRange(symbol, interval, cursor, end, "futures"));
    if (!page.length) break;
    out.push(...page);
    cursor = page.at(-1)!.openTime + step;
    if (page.length < MAX_KLINES_PER_REQUEST.futures) break;
    await sleep(400); // klines limit=1500 og'ir (weight 10) — minutiga ~150 so'rov
  }
  const closed = out.filter((c) => c.closeTime <= Date.now());
  if (closed.length !== cached.length || !usable) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(closed));
  }
  return closed.filter((c) => c.openTime >= start);
}

/** Funding tarixi (`.cache/research/funding`, research-download bilan yuklangan): [vaqt, stavka]. */
export async function loadFunding(symbol: string): Promise<{ t: number; r: number }[]> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), ".cache", "research", "funding", `${symbol}.json`), "utf8"));
  } catch {
    return [];
  }
}

const regimeCache = new Map<string, RegimeBar[]>();
export async function loadRegime(tf: string, start: number, end: number = Date.now()): Promise<RegimeBar[]> {
  const key = `${tf}:${start}`;
  const hit = regimeCache.get(key);
  if (hit) return hit;
  const from = start - 260 * INTERVAL_MS[tf]!;
  const btc = await loadCandles("BTCUSDT", tf, from, end);
  const eth = await loadCandles("ETHUSDT", tf, from, end);
  const alts: Candle[][] = [];
  for (const s of REGIME_ALT_BASKET) alts.push(await loadCandles(s, tf, from, end));
  const bars = computeRegime(btc, eth, alts);
  regimeCache.set(key, bars);
  return bars;
}

export interface LiveSpec {
  id: StrategyId;
  tf: string;
  htf: string;
  days: number;
  symbols: readonly string[];
  run: (symbol: string, candles: Candle[], htf: Candle[], filter?: (side: "long" | "short", t: number) => boolean) => BacktestTrade[];
}

const fqRun = (id: "fq_15m" | "fq_v3" | "fq_4h") => (symbol: string, candles: Candle[], htf: Candle[], filter?: (s: "long" | "short", t: number) => boolean) =>
  backtestFq(symbol, candles, htf, { config: FQ_PROFILES[id].config, filter });

export const LIVE_SPECS: LiveSpec[] = [
  { id: "fq_15m", tf: "15m", htf: FQ_PROFILES.fq_15m.htfInterval, days: 365, symbols: CORE_20, run: fqRun("fq_15m") },
  { id: "fq_v3", tf: "1h", htf: FQ_PROFILES.fq_v3.htfInterval, days: 730, symbols: CORE_20, run: fqRun("fq_v3") },
  { id: "fq_4h", tf: "4h", htf: FQ_PROFILES.fq_4h.htfInterval, days: 1095, symbols: FQ_PROFILES.fq_4h.symbols ?? CORE_20, run: fqRun("fq_4h") },
  {
    id: "st_day", tf: "15m", htf: "1h", days: 365, symbols: DAY_SYMBOLS,
    run: (symbol, candles, htf, filter) => backtestDay(symbol, candles, htf, { filter }),
  },
  {
    id: "smc_4h", tf: "4h", htf: "1d", days: 1095, symbols: SMC_SYMBOLS,
    run: (symbol, candles, htf, filter) => {
      const trades = backtestSmc(symbol, candles, htf, SMC_CONFIG);
      return filter ? trades.filter((tr) => filter(tr.side, tr.signalTime + INTERVAL_MS["4h"]!)) : trades;
    },
  },
];

export interface SpecData {
  spec: LiveSpec;
  start: number;
  split: number;
  coins: { symbol: string; candles: Candle[]; htf: Candle[] }[];
  regime: RegimeBar[];
}

export async function loadSpecData(spec: LiveSpec, end: number = Date.now()): Promise<SpecData> {
  const start = end - spec.days * 86_400_000;
  const htfStart = start - 220 * INTERVAL_MS[spec.htf]!;
  const coins: SpecData["coins"] = [];
  for (const symbol of spec.symbols) {
    // Indikatorlar isishi uchun 300 sham oldindan.
    const candles = await loadCandles(symbol, spec.tf, start - 300 * INTERVAL_MS[spec.tf]!, end);
    const htf = await loadCandles(symbol, spec.htf, htfStart, end);
    if (candles.length >= 400) coins.push({ symbol, candles, htf });
  }
  const regime = await loadRegime(REGIME_FILTERS[spec.id].tf, start, end);
  return { spec, start, split: start + (end - start) * 0.7, coins, regime };
}

/** Live bilan bir xil: rejim filtri bilan barcha savdolar (start'dan keyingi signallar). */
export function liveTrades(data: SpecData, extra?: (symbol: string, side: "long" | "short", t: number) => boolean): BacktestTrade[] {
  const { rule } = REGIME_FILTERS[data.spec.id];
  return data.coins.flatMap((c) =>
    data.spec
      .run(c.symbol, c.candles, c.htf, (side, t) =>
        regimeAllows(rule, regimeAt(data.regime, t), side, c.symbol) && (!extra || extra(c.symbol, side, t)),
      )
      .filter((tr) => tr.signalTime >= data.start),
  );
}

/** Portfel cheklovi: bir vaqtda bir tomonda eng ko'pi `cap` ta ochiq savdo (signal vaqti tartibida). */
export function applySideCap(trades: BacktestTrade[], cap: number): BacktestTrade[] {
  if (!(cap > 0) || !Number.isFinite(cap)) return trades;
  const accepted: BacktestTrade[] = [];
  for (const tr of [...trades].sort((a, b) => a.signalTime - b.signalTime)) {
    const open = accepted.filter((o) => o.side === tr.side && o.closedAt > tr.signalTime).length;
    if (open < cap) accepted.push(tr);
  }
  return accepted;
}
