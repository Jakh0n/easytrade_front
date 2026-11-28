/**
 * SMC MTF (4H → 1H → 5m) backtest — live `evaluateMtf` bilan.
 *
 *   npx tsx lib/server/scripts/mtf-backtest.ts                       # SMC_SYMBOLS (40), 365 kun
 *   npx tsx lib/server/scripts/mtf-backtest.ts --days 180 --symbols BTCUSDT,ETHUSDT
 *
 * Shamlar `.cache/backtest/` ga saqlanadi (run-backtest bilan umumiy kesh).
 * Natija: train (birinchi 70%) / test (oxirgi 30%), intizomsiz va portfel intizomi bilan.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyDiscipline, backtestMtf, type MtfTrade } from "../backtest/mtf-backtest";
import { summarize, type BacktestStats } from "../backtest/fq-backtest";
import { MAX_KLINES_PER_REQUEST, getKlinesRange } from "../services/binance.service";
import { SMC_SYMBOLS } from "../services/smc.service";
import type { Candle } from "../types/index";

const CACHE_DIR = path.join(process.cwd(), ".cache", "backtest");
const INTERVAL_MS: Record<string, number> = { "5m": 300_000, "1h": 3_600_000, "4h": 14_400_000 };
const WARMUP = 320;

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
    let page: Candle[] = [];
    for (let attempt = 0; ; attempt++) {
      try {
        page = await getKlinesRange(symbol, interval, cursor, end, "futures");
        break;
      } catch (error) {
        // So'rov limiti: kutib qayta urinamiz.
        const message = error instanceof Error ? error.message : String(error);
        if (attempt >= 5 || !message.includes("limit")) throw error;
        await sleep(30_000 * (attempt + 1));
      }
    }
    if (!page.length) break;
    out.push(...page);
    cursor = page.at(-1)!.openTime + step;
    if (page.length < MAX_KLINES_PER_REQUEST.futures) break;
    await sleep(400);
  }
  const closed = out.filter((c) => c.closeTime <= Date.now());
  await mkdir(CACHE_DIR, { recursive: true });
  if (closed.length !== cached.length) await writeFile(file, JSON.stringify(closed));
  return closed.filter((c) => c.openTime >= start);
}

function row(label: string, s: BacktestStats): string {
  const pf = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞";
  const sign = (x: number, d: number) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;
  return [
    label.padEnd(22),
    String(s.trades).padStart(6),
    `${s.winRate.toFixed(1)}%`.padStart(7),
    sign(s.avgR, 3).padStart(7),
    pf.padStart(5),
    sign(s.totalR, 1).padStart(7),
    s.maxDrawdownR.toFixed(1).padStart(6),
    s.avgCostR.toFixed(3).padStart(6),
  ].join(" ");
}

const HEADER = `${"".padEnd(22)} trades     win    avgR    PF  totalR  maxDD   cost`;

async function main(): Promise<void> {
  const days = Number(arg("days") ?? 365);
  const symbols = arg("symbols")?.split(",") ?? [...SMC_SYMBOLS];
  const end = Date.now();
  const start = end - days * 86_400_000;
  console.log(`SMC MTF backtest: ${symbols.length} coin · ${days} kun · 4H → 1H → 5m · maker 0.02%, taker 0.07%\n`);

  const all: MtfTrade[] = [];
  let setups = 0;
  let cancelled = 0;
  for (const symbol of symbols) {
    const t0 = Date.now();
    try {
      const c4h = await loadCandles(symbol, "4h", start - WARMUP * INTERVAL_MS["4h"]!, end);
      const c1h = await loadCandles(symbol, "1h", start - WARMUP * INTERVAL_MS["1h"]!, end);
      const c5m = await loadCandles(symbol, "5m", start - WARMUP * INTERVAL_MS["5m"]!, end);
      const res = backtestMtf(symbol, c4h, c1h, c5m);
      all.push(...res.trades);
      setups += res.setups;
      cancelled += res.cancelled;
      const total = res.trades.reduce((s, t) => s + t.netR, 0);
      console.log(
        `  ${symbol.padEnd(10)} setup ${String(res.setups).padStart(3)} · savdo ${String(res.trades.length).padStart(3)} · ${total >= 0 ? "+" : ""}${total.toFixed(1)}R  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
      );
    } catch (error) {
      console.log(`  ${symbol}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const split = start + (end - start) * 0.7;
  const disciplined = applyDiscipline(all);
  console.log(`\nSetup: ${setups} · limit to'lmadi/bekor: ${cancelled} (${setups ? ((cancelled / setups) * 100).toFixed(0) : 0}%) · savdo: ${all.length}\n`);
  console.log(HEADER);
  console.log("─".repeat(HEADER.length));
  const sets: [string, MtfTrade[]][] = [
    ["Hammasi", all],
    ["  train (70%)", all.filter((t) => t.signalTime < split)],
    ["  test (30%)", all.filter((t) => t.signalTime >= split)],
    ["Intizom bilan (≤3/kun)", disciplined],
    ["  train", disciplined.filter((t) => t.signalTime < split)],
    ["  test", disciplined.filter((t) => t.signalTime >= split)],
    ["LONG", all.filter((t) => t.side === "long")],
    ["SHORT", all.filter((t) => t.side === "short")],
    ["Ishonch: high", all.filter((t) => t.confidence === "high")],
    ["Ishonch: medium", all.filter((t) => t.confidence === "medium")],
    ["Zona: OB+FVG", all.filter((t) => t.confluence)],
    ["Zona: faqat OB", all.filter((t) => !t.confluence && t.confluences[0] === "OB")],
    ["Zona: faqat FVG", all.filter((t) => !t.confluence && t.confluences[0] === "FVG")],
    ["Kirish: FVG", all.filter((t) => t.entryType === "FVG")],
    ["Kirish: OB", all.filter((t) => t.entryType === "OB")],
    ["Kirish: CHoCH 50%", all.filter((t) => t.entryType === "CHOCH_50")],
    ["Kirish: market", all.filter((t) => t.entryType === "MARKET")],
    ["Rejadagi R:R ≥ 3", all.filter((t) => t.plannedRR >= 3)],
    ["Rejadagi R:R 2–3", all.filter((t) => t.plannedRR < 3)],
  ];
  for (const [label, list] of sets) console.log(row(label, summarize(list)));

  const statuses: Record<string, number> = {};
  for (const t of all) statuses[t.status] = (statuses[t.status] ?? 0) + 1;
  console.log(`\nYakun: ${Object.entries(statuses).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

  const months = new Map<string, number[]>();
  for (const t of disciplined) {
    const m = new Date(t.signalTime).toISOString().slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), t.netR]);
  }
  console.log("\nOylar (intizom bilan):");
  for (const [m, rs] of [...months].sort()) {
    const sum = rs.reduce((a, b) => a + b, 0);
    console.log(`  ${m}  ${String(rs.length).padStart(3)} savdo  ${sum >= 0 ? "+" : ""}${sum.toFixed(1)}R`);
  }

  const out = path.join(CACHE_DIR, "mtf-trades.json");
  await writeFile(out, JSON.stringify(all, null, 1));
  console.log(`\nSavdolar: ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
