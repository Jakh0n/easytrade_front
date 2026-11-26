/**
 * Bozor rejimi filtri (TOTAL3 / TOTAL2 / BTC.D / breadth proxy) — har strategiyada filtrsiz va
 * filtrli natijalarni solishtiradi. Train = vaqt bo'yicha birinchi 70%, test = oxirgi 30%.
 *
 *   npx tsx lib/server/scripts/regime-backtest.ts
 *   npx tsx lib/server/scripts/regime-backtest.ts --strategies fq_15m,fq_v3 --ema 200
 *
 * Shamlar `.cache/backtest/` dan olinadi (yo'q bo'lsa Binance'dan yuklanadi).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { backtestDay, backtestFq, summarize, type BacktestStats, type BacktestTrade } from "../backtest/fq-backtest";
import { SMC_CONFIG, backtestSmc } from "../backtest/smc-backtest";
import { FQ_15M_CONFIG, FQ_4H_CONFIG, FQ_SWING_CONFIG, type FqConfig } from "../services/fq-strategy/engine";
import {
  REGIME_ALT_BASKET,
  REGIME_RULES,
  computeRegime,
  regimeAllows,
  regimeAt,
  type RegimeBar,
  type RegimeRule,
} from "../services/market-regime/engine";
import { MAX_KLINES_PER_REQUEST, getKlinesRange } from "../services/binance.service";
import type { Candle } from "../types/index";

const CACHE_DIR = path.join(process.cwd(), ".cache", "backtest");
const INTERVAL_MS: Record<string, number> = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

const CORE_20 = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "DOTUSDT",
  "LTCUSDT", "BCHUSDT", "NEARUSDT", "UNIUSDT", "AAVEUSDT", "ATOMUSDT", "FILUSDT", "ETCUSDT", "SUIUSDT", "TRXUSDT",
];
const DAY_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "SUIUSDT"];
const SMC_SYMBOLS = [
  ...CORE_20, "APTUSDT", "ARBUSDT", "OPUSDT", "INJUSDT", "TIAUSDT", "SEIUSDT", "ICPUSDT", "HBARUSDT", "XLMUSDT", "ALGOUSDT",
  "VETUSDT", "SANDUSDT", "AXSUSDT", "GALAUSDT", "CRVUSDT", "LDOUSDT", "RUNEUSDT", "STXUSDT", "IMXUSDT", "GRTUSDT",
];

interface StrategySpec {
  id: string;
  tf: string;
  htf: string;
  days: number;
  symbols: string[];
  /** Sinaladigan rejim timeframe'lari (birinchisi — asosiy). */
  regimeTfs: string[];
  run: (symbol: string, candles: Candle[], htf: Candle[], filter?: (side: "long" | "short", t: number) => boolean) => BacktestTrade[];
}

const fq = (config: FqConfig) => (symbol: string, candles: Candle[], htf: Candle[], filter?: (s: "long" | "short", t: number) => boolean) =>
  backtestFq(symbol, candles, htf, { config, filter });

const STRATEGIES: StrategySpec[] = [
  { id: "fq_15m", tf: "15m", htf: "1h", days: 365, symbols: CORE_20, regimeTfs: ["1h", "4h"], run: fq(FQ_15M_CONFIG) },
  { id: "fq_v3", tf: "1h", htf: "4h", days: 730, symbols: CORE_20, regimeTfs: ["4h", "1h"], run: fq(FQ_SWING_CONFIG) },
  { id: "fq_4h", tf: "4h", htf: "1d", days: 1095, symbols: CORE_20, regimeTfs: ["1d", "4h"], run: fq(FQ_4H_CONFIG) },
  {
    id: "st_day", tf: "15m", htf: "1h", days: 365, symbols: DAY_SYMBOLS, regimeTfs: ["1h", "4h"],
    run: (symbol, candles, htf, filter) => backtestDay(symbol, candles, htf, { filter }),
  },
  {
    // SMC: setup yaratilgan shamda filtr (post-hoc) — kutilayotgan orderni almashtirish dinamikasi biroz farq qiladi.
    id: "smc_4h", tf: "4h", htf: "1d", days: 1095, symbols: SMC_SYMBOLS, regimeTfs: ["1d", "4h"],
    run: (symbol, candles, htf, filter) => {
      const trades = backtestSmc(symbol, candles, htf, SMC_CONFIG);
      return filter ? trades.filter((tr) => filter(tr.side, tr.signalTime + INTERVAL_MS["4h"]!)) : trades;
    },
  },
];

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
  while (cursor < end - step) {
    const page = await getKlinesRange(symbol, interval, cursor, end, "futures");
    if (!page.length) break;
    out.push(...page);
    cursor = page.at(-1)!.openTime + step;
    if (page.length < MAX_KLINES_PER_REQUEST.futures) break;
    await sleep(150);
  }
  const closed = out.filter((c) => c.closeTime <= Date.now());
  if (closed.length !== cached.length) {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(closed));
  }
  return closed.filter((c) => c.openTime >= start);
}

function fmt(s: BacktestStats): string {
  const pf = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞";
  return [
    String(s.trades).padStart(5),
    `${s.winRate.toFixed(1)}%`.padStart(6),
    `${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(3)}`.padStart(7),
    pf.padStart(5),
    `${s.totalR >= 0 ? "+" : ""}${s.totalR.toFixed(1)}`.padStart(7),
    s.maxDrawdownR.toFixed(1).padStart(6),
  ].join(" ");
}

const regimeCache = new Map<string, RegimeBar[]>();
async function loadRegime(tf: string, start: number, end: number, emaLen: number): Promise<RegimeBar[]> {
  const key = `${tf}:${emaLen}:${start}`;
  const hit = regimeCache.get(key);
  if (hit) return hit;
  const from = start - (emaLen + 50) * INTERVAL_MS[tf]!;
  const btc = await loadCandles("BTCUSDT", tf, from, end);
  const eth = await loadCandles("ETHUSDT", tf, from, end);
  const alts: Candle[][] = [];
  for (const s of REGIME_ALT_BASKET) alts.push(await loadCandles(s, tf, from, end));
  const bars = computeRegime(btc, eth, alts, emaLen);
  regimeCache.set(key, bars);
  return bars;
}

async function main(): Promise<void> {
  const emaLen = Number(arg("ema") ?? 200);
  const only = arg("strategies")?.split(",");
  const rules = (arg("rules")?.split(",") ?? [...REGIME_RULES]) as RegimeRule[];
  const end = Date.now();
  const header = "trades   win    avgR    PF  totalR  maxDD";

  for (const spec of STRATEGIES.filter((s) => !only || only.includes(s.id))) {
    const start = end - spec.days * 86_400_000;
    const split = start + (end - start) * 0.7;
    const htfStart = start - 220 * INTERVAL_MS[spec.htf]!;
    const data: { symbol: string; candles: Candle[]; htf: Candle[] }[] = [];
    for (const symbol of spec.symbols) {
      const candles = await loadCandles(symbol, spec.tf, start, end);
      const htf = await loadCandles(symbol, spec.htf, htfStart, end);
      if (candles.length >= 400) data.push({ symbol, candles, htf });
    }

    console.log(
      `\n═══ ${spec.id} · ${spec.tf} (${spec.htf} bias) · ${data.length} coin · ${spec.days} kun · rejim EMA ${emaLen} ═══`,
    );
    console.log(`${"rejim".padEnd(14)} │ TRAIN ${header} │ TEST  ${header}`);

    const baseline = data.flatMap((d) => spec.run(d.symbol, d.candles, d.htf));
    const print = (name: string, trades: BacktestTrade[]) => {
      const train = trades.filter((t) => t.signalTime < split);
      const test = trades.filter((t) => t.signalTime >= split);
      console.log(`${name.padEnd(14)} │       ${fmt(summarize(train))} │       ${fmt(summarize(test))}`);
    };
    print("off", baseline);

    for (const tf of spec.regimeTfs) {
      const bars = await loadRegime(tf, start, end, emaLen);
      for (const rule of rules.filter((r) => r !== "off")) {
        const trades = data.flatMap((d) =>
          spec.run(d.symbol, d.candles, d.htf, (side, t) => regimeAllows(rule, regimeAt(bars, t), side, d.symbol)),
        );
        print(`${rule}@${tf}`, trades);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
