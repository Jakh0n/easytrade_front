/** xsMomVol barqarorlik tekshiruvi: npx tsx lib/server/scripts/research-sweep.ts [--funding] */
import { loadPanel } from "../backtest/research/data";
import { longShort, metrics, realizedVol, simulate, type Strategy } from "../backtest/research/engine";
import type { Panel } from "../backtest/research/data";

function momVol(lookback: number, q: number, volWin = 30, sides: "both" | "long" | "short" = "both", skip = 0): Strategy {
  return ({ panel, d, universe }) =>
    longShort(
      universe.map((i) => {
        const a = panel.close[d - lookback]?.[i];
        const b = panel.close[d - skip]![i]!;
        const r = a && Number.isFinite(a) ? b / a - 1 : NaN;
        return [i, r / realizedVol(panel as Panel, i, d, volWin)];
      }),
      q,
      sides,
    );
}

/** Botdagi konfiguratsiya: bir nechta lookback score'larining o'rtachasi. */
function momVolBlend(lookbacks: number[], q: number): Strategy {
  return ({ panel, d, universe }) =>
    longShort(
      universe.map((i) => {
        const v = realizedVol(panel as Panel, i, d, 30);
        const parts = lookbacks.map((L) => {
          const a = panel.close[d - L]?.[i];
          return a && Number.isFinite(a) ? (panel.close[d]![i]! / a - 1) / v : NaN;
        });
        return [i, parts.reduce((x, y) => x + y, 0) / parts.length];
      }),
      q,
    );
}

async function main(): Promise<void> {
  const useFunding = process.argv.includes("--funding");
  const panel = await loadPanel(useFunding);
  const split = Date.UTC(2025, 0, 1);
  const start = Date.UTC(2022, 3, 1);
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;
  const run = (label: string, s: Strategy, every = 7, topN = 100, cost = 0.0007, offset = 0) => {
    const r = simulate(panel, s, { rebalanceEvery: every, cost, useFunding, universe: { topN, minAgeDays: 60 }, offset });
    const a = metrics(r.days, r.returns, start);
    const tr = metrics(r.days, r.returns, start, split);
    const te = metrics(r.days, r.returns, split);
    const yrs = ["2022", "2023", "2024", "2025", "2026"].map((y) => pct(a.byYear[y] ?? 0).padStart(6)).join("");
    console.log(
      `${label.padEnd(30)} ${pct(a.cagr).padStart(5)} ${a.sharpe.toFixed(2).padStart(6)} ${pct(-a.maxDd).padStart(5)} │ ${tr.sharpe.toFixed(2).padStart(6)} ${te.sharpe.toFixed(2).padStart(6)} │${yrs} │ turnover/yil ${(r.turnover / (r.days.length / 365)).toFixed(0)}x${useFunding ? ` funding ${pct(-r.fundingPaid / (r.days.length / 365))}/yil` : ""}`,
    );
  };
  console.log(`funding ${useFunding ? "bor" : "yo'q"}            CAGR Sharpe  maxDD │ train   test │  2022  2023  2024  2025  2026`);
  if (process.argv.includes("--bot")) {
    run("BOT: blend 14/30/60 q0.1", momVolBlend([14, 30, 60], 0.1));
    run("blend 14/30/60 q0.2", momVolBlend([14, 30, 60], 0.2));
    for (const o of [1, 2, 3, 4, 5, 6]) run(`BOT ofset ${o}`, momVolBlend([14, 30, 60], 0.1), 7, 100, 0.0007, o);
    run("BOT xarajat x2", momVolBlend([14, 30, 60], 0.1), 7, 100, 0.0014);
    run("BOT top 150", momVolBlend([14, 30, 60], 0.1), 7, 150);
    return;
  }
  for (const L of [14, 21, 30, 45, 60, 90]) run(`lookback ${L}`, momVol(L, 0.2));
  for (const q of [0.1, 0.3]) run(`q ${q}`, momVol(30, q));
  for (const v of [14, 60]) run(`volWin ${v}`, momVol(30, 0.2, v));
  for (const n of [30, 50, 200, 300]) run(`top ${n}`, momVol(30, 0.2), 7, n);
  for (const o of [1, 2, 3, 4, 5, 6]) run(`rebalans ofset ${o}`, momVol(30, 0.2), 7, 100, 0.0007, o);
  run("rebalans 14 kun", momVol(30, 0.2), 14);
  run("rebalans 3 kun", momVol(30, 0.2), 3);
  run("xarajat x2 (0.14%)", momVol(30, 0.2), 7, 100, 0.0014);
  run("skip 1 kun", momVol(30, 0.2, 30, "both", 1));
  run("faqat LONG tomon", momVol(30, 0.2, 30, "long"));
  run("faqat SHORT tomon", momVol(30, 0.2, 30, "short"));
}
main();
