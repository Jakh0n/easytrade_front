/**
 * Signal engine v2 backtest (same code path as live).
 *
 *   npm run backtest:engine                                   # CORE_20, last 180 days
 *   npm run backtest:engine -- --days 90 --symbols BTCUSDT,ETHUSDT,SOLUSDT
 *   npm run backtest:engine -- --csv                          # also write features + labels CSV (ML)
 *
 * Output per strategy: signals, fill rate, win rate, avg R (net of costs), profit factor,
 * max drawdown, avg time to TP1 — attributed by participation and by primary strategy,
 * plus per regime and per grade. First run downloads ~6 months of 4h/1h/15m/5m klines,
 * funding and OI into .cache/backtest/ (several minutes); later runs are offline.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runEngineBacktest } from "../backtest/engine-backtest";
import { loadSymbolHistory, type SymbolHistory } from "../backtest/engine-data";
import { CACHE_DIR, CORE_20, loadCandles } from "../backtest/live-strategies";
import { ENGINE_CONFIG, STRATEGY_LABELS } from "../signal-engine/config";
import { breakdown, type StrategySummary } from "../signal-engine/stats";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const cfg = ENGINE_CONFIG;
const days = Number(arg("days") ?? cfg.backtest.days);
const symbols = (arg("symbols")?.split(",") ?? CORE_20).map((s) => s.trim().toUpperCase());
const writeCsv = process.argv.includes("--csv");

const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? "∞" : "—");

function row(name: string, s: StrategySummary): string {
  return [
    name.padEnd(22),
    String(s.signals).padStart(6),
    String(s.filled).padStart(6),
    String(s.closed).padStart(6),
    `${fmt(s.winRate, 1)}%`.padStart(7),
    fmt(s.avgR, 3).padStart(7),
    fmt(s.totalR, 1).padStart(7),
    fmt(s.profitFactor).padStart(6),
    fmt(s.maxDrawdownR, 1).padStart(6),
    (s.avgMinutesToTp1 === null ? "—" : `${Math.round(s.avgMinutesToTp1)}m`).padStart(7),
    String(s.expired).padStart(5),
    String(s.invalidated).padStart(5),
  ].join(" ");
}

const HEADER = [
  "".padEnd(22),
  "sig".padStart(6),
  "fill".padStart(6),
  "closed".padStart(6),
  "win".padStart(7),
  "avgR".padStart(7),
  "sumR".padStart(7),
  "PF".padStart(6),
  "maxDD".padStart(6),
  "→TP1".padStart(7),
  "exp".padStart(5),
  "inv".padStart(5),
].join(" ");

function table(title: string, entries: Record<string, StrategySummary>, label: (k: string) => string = (k) => k): void {
  console.log(`\n${title}\n${HEADER}`);
  for (const [k, s] of Object.entries(entries).sort((a, b) => b[1].signals - a[1].signals)) console.log(row(label(k), s));
}

async function main(): Promise<void> {
  const end = Math.floor(Date.now() / 900_000) * 900_000;
  const start = end - days * 86_400_000;
  const warmupMs = 260 * 4 * 3_600_000;
  console.log(`Engine backtest: ${symbols.length} symbols, ${days} days (${new Date(start).toISOString().slice(0, 10)} → ${new Date(end).toISOString().slice(0, 10)})`);

  const histories: SymbolHistory[] = [];
  for (const symbol of symbols) {
    process.stdout.write(`  loading ${symbol}… `);
    try {
      const h = await loadSymbolHistory(symbol, start, end, warmupMs);
      histories.push(h);
      console.log(`15m ${h.c15m.length}, 5m ${h.c5m.length}, OI ${h.oi.length}, funding ${h.funding.length}`);
    } catch (error) {
      console.log(`skipped (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  const btc1h = await loadCandles("BTCUSDT", "1h", start - warmupMs, end);

  const t0 = Date.now();
  const result = runEngineBacktest(histories, btc1h, start, end, cfg, (pct) => process.stdout.write(`\r  simulating ${(pct * 100).toFixed(0)}%`));
  console.log(`\r  simulated ${result.steps} steps in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  const stats = breakdown(result.trades);
  const label = (k: string) => STRATEGY_LABELS[k as keyof typeof STRATEGY_LABELS] ?? k;
  console.log(`\nCosts: ${cfg.backtest.roundTripCostPct}% round trip, deducted in R. R = net result per filled trade.`);
  console.log("Regime bars:", result.regimeBars);
  console.log("Decisions:", result.decisions);
  console.log(`WATCH signals: ${result.trades.filter((t) => t.kind === "watch").length}`);
  table("OVERALL", { all: stats.overall });
  table("BY STRATEGY (credited to every agreeing strategy)", stats.byStrategy, label);
  table("BY PRIMARY STRATEGY (credited once)", stats.byPrimaryStrategy, label);
  table("BY GRADE", stats.byGrade);
  for (const [strategy, regimes] of Object.entries(stats.byStrategyRegime)) table(`${label(strategy)} — by regime`, regimes);

  const outDir = path.join(CACHE_DIR, "engine");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const jsonFile = path.join(outDir, `backtest-${stamp}.json`);
  await writeFile(jsonFile, JSON.stringify({ days, symbols, config: cfg, stats, decisions: result.decisions, trades: result.trades }, null, 1));
  console.log(`\nSaved ${jsonFile}`);

  if (writeCsv) {
    const entries = result.trades.filter((t) => t.kind === "entry" && t.netR !== null);
    const featureKeys = [...new Set(entries.flatMap((t) => Object.keys(t.features)))].sort();
    const cols = ["symbol", "direction", "primaryStrategy", "grade", "regime", "confidence", "createdAt", "status", "netR", "mfeR", "maeR", "hitTp1", ...featureKeys];
    const esc = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "string" && v.includes(",") ? `"${v}"` : String(v));
    const lines = [cols.join(",")];
    for (const t of entries) {
      const base: Record<string, unknown> = { ...t, createdAt: new Date(t.createdAt).toISOString(), hitTp1: t.tp1At !== null };
      lines.push(cols.map((c) => esc(c in base && !featureKeys.includes(c) ? base[c] : t.features[c] ?? base[c])).join(","));
    }
    const csvFile = path.join(outDir, `backtest-${stamp}.csv`);
    await writeFile(csvFile, lines.join("\n"));
    console.log(`Saved ${csvFile} (${entries.length} rows × ${cols.length} columns — features + labels for ML)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
