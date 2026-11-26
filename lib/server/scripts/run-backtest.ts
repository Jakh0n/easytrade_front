/**
 * FQ v3 backtest: bazaviy strategiya va konfluens variantlari (Fib / OB / BOS / Sweep / chiqishlar).
 *
 *   npm run backtest                          # top 30 futures, 730 kun, barcha variantlar
 *   npm run backtest -- --universe 15 --days 365
 *   npm run backtest -- --symbols BTCUSDT,ETHUSDT --variants baseline,fib
 *
 * Shamlar `.cache/backtest/` ga saqlanadi — qayta ishga tushirishda Binance'ga so'rov ketmaydi.
 * Natija: train (vaqt bo'yicha birinchi 70%) va test (oxirgi 30%) alohida.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { backtestDay, backtestFq, summarize, type BacktestStats, type BacktestTrade } from "../backtest/fq-backtest";
import { FQ_SWING_CONFIG, type FqConfig } from "../services/fq-strategy/engine";
import {
  MAX_KLINES_PER_REQUEST,
  getAll24hrTickers,
  getCryptoFuturesSymbols,
  getKlinesRange,
} from "../services/binance.service";
import type { Candle } from "../types/index";

const CACHE_DIR = path.join(process.cwd(), ".cache", "backtest");
const INTERVAL_MS: Record<string, number> = {
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};
const STABLES = new Set(["USDCUSDT", "FDUSDUSDT", "TUSDUSDT", "BUSDUSDT", "USDPUSDT", "DAIUSDT", "USDEUSDT"]);

export const VARIANTS: Record<string, Partial<FqConfig>> = {
  baseline: {},
  fib: { useFibZone: true },
  ob: { useOrderBlock: true },
  obFvg: { useOrderBlock: true, obRequireFvg: true },
  bos: { useStructure: true },
  sweep: { useSweepTrigger: true },
  stopStruct: { stopMode: "structure" },
  exit1272: { exitMode: "fib1272" },
  exit1618: { exitMode: "fib1618" },
  fibBos: { useFibZone: true, useStructure: true },
  fibOb: { useFibZone: true, useOrderBlock: true },
  noBreakout: { useBreakout: false },
  sweepBos: { useSweepTrigger: true, useStructure: true },
  obStop: { useOrderBlock: true, stopMode: "structure" },
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadCandles(symbol: string, interval: string, start: number, end: number): Promise<Candle[]> {
  const file = path.join(CACHE_DIR, `${symbol}-${interval}.json`);
  let cached: Candle[] = [];
  try {
    cached = JSON.parse(await readFile(file, "utf8")) as Candle[];
  } catch {
    /* kesh yo'q */
  }
  const step = INTERVAL_MS[interval]!;
  const have = cached.length && cached[0]!.openTime <= start + step ? cached : [];
  let cursor = have.length ? have.at(-1)!.openTime + step : start;
  const out = [...have];
  while (cursor < end) {
    const page = await getKlinesRange(symbol, interval, cursor, end, "futures");
    if (!page.length) break;
    out.push(...page);
    cursor = page.at(-1)!.openTime + step;
    if (page.length < MAX_KLINES_PER_REQUEST.futures) break;
    await sleep(150);
  }
  const closed = out.filter((c) => c.closeTime <= Date.now());
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(closed));
  return closed.filter((c) => c.openTime >= start);
}

async function universe(n: number): Promise<string[]> {
  const [tickers, crypto] = await Promise.all([getAll24hrTickers("futures"), getCryptoFuturesSymbols()]);
  return tickers
    .filter((t) => t.symbol.endsWith("USDT") && crypto.has(t.symbol) && !STABLES.has(t.symbol))
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, n)
    .map((t) => t.symbol);
}

function fmt(s: BacktestStats): string {
  const pf = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞";
  return [
    String(s.trades).padStart(5),
    `${s.winRate.toFixed(1)}%`.padStart(7),
    `${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(3)}`.padStart(7),
    pf.padStart(5),
    `${s.totalR >= 0 ? "+" : ""}${s.totalR.toFixed(1)}`.padStart(7),
    s.maxDrawdownR.toFixed(1).padStart(6),
    `${s.avgGrossR >= 0 ? "+" : ""}${s.avgGrossR.toFixed(3)}`.padStart(7),
    s.avgCostR.toFixed(3).padStart(6),
  ].join(" ");
}

async function main(): Promise<void> {
  const days = Number(arg("days") ?? 730);
  const strategy = arg("strategy") ?? "fq";
  const tf = arg("tf") ?? (strategy === "day" ? "15m" : "1h");
  const htfTf = arg("htf") ?? (strategy === "day" ? "1h" : tf === "4h" ? "1d" : "4h");
  const entryMode = (arg("entry") ?? "market") as "market" | "limit";
  const limitFrac = Number(arg("limit-frac") ?? 0.5);
  const limitBars = Number(arg("limit-bars") ?? 3);
  const end = Date.now();
  const start = end - days * 86_400_000;
  // HTF EMA200 uchun qo'shimcha tarix.
  const htfStart = start - 220 * INTERVAL_MS[htfTf]!;
  const variantNames = strategy === "day" ? ["day"] : (arg("variants") ?? Object.keys(VARIANTS).join(",")).split(",");
  const symbols = arg("symbols")?.split(",") ?? (await universe(Number(arg("universe") ?? 30)));

  console.log(
    `Backtest ${strategy}: ${symbols.length} coin · ${days} kun · ${tf} (${htfTf} bias) · kirish ${entryMode}${entryMode === "limit" ? ` ${limitFrac}R/${limitBars} sham` : ""} · taker 0.07%, maker 0.02%`,
  );
  console.log(`Coinlar: ${symbols.join(", ")}\n`);

  const data: { symbol: string; candles: Candle[]; htf: Candle[] }[] = [];
  for (const symbol of symbols) {
    try {
      const [candles, htf] = [await loadCandles(symbol, tf, start, end), await loadCandles(symbol, htfTf, htfStart, end)];
      if (candles.length < 400) {
        console.log(`  ${symbol}: tarix qisqa (${candles.length}) — o'tkazildi`);
        continue;
      }
      data.push({ symbol, candles, htf });
    } catch (error) {
      console.log(`  ${symbol}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const split = start + (end - start) * 0.7;
  const header = "trades    win    avgR    PF  totalR  maxDD  gross   cost";
  console.log(`${"variant".padEnd(12)} │ TRAIN ${header} │ TEST  ${header}`);
  console.log("─".repeat(12 + 2 * (header.length + 9)));

  for (const name of variantNames) {
    const overrides = name === "day" ? {} : VARIANTS[name];
    if (!overrides) {
      console.log(`${name}: noma'lum variant`);
      continue;
    }
    const config: FqConfig = { ...FQ_SWING_CONFIG, ...overrides };
    const trades: BacktestTrade[] = data.flatMap((d) =>
      strategy === "day"
        ? backtestDay(d.symbol, d.candles, d.htf)
        : backtestFq(d.symbol, d.candles, d.htf, { config, entryMode, limitFrac, limitBars }),
    );
    const train = trades.filter((t) => t.signalTime < split);
    const test = trades.filter((t) => t.signalTime >= split);
    console.log(`${name.padEnd(12)} │       ${fmt(summarize(train))} │       ${fmt(summarize(test))}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
