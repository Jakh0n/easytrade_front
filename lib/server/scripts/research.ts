/**
 * Barcha Binance USDT perpetual'lar (delisting bo'lganlari ham) bo'yicha strategiya tadqiqoti.
 *   npx tsx lib/server/scripts/research.ts [--funding] [--top 100] [--only name1,name2]
 *
 * Har bir strategiya: kunlik portfel, xarajat 0.07%/tomon, (ixtiyoriy) funding.
 * Train = 2022–2024, test = 2025–hozir. Yillar bo'yicha natija ham chiqadi.
 */
import { loadPanel } from "../backtest/research/data";
import { metrics, simulate, strategies as S, type Strategy } from "../backtest/research/engine";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export const CANDIDATES: Record<string, { s: Strategy; every: number }> = {
  btcHold: { s: S.btcHold(), every: 7 },
  "xsMom 7d / w": { s: S.xsMom(7), every: 7 },
  "xsMom 14d / w": { s: S.xsMom(14), every: 7 },
  "xsMom 30d / w": { s: S.xsMom(30), every: 7 },
  "xsMom 60d / w": { s: S.xsMom(60), every: 7 },
  "xsMom 30d / d": { s: S.xsMom(30), every: 1 },
  "xsMomVol 30d / w": { s: S.xsMomVolAdj(30), every: 7 },
  "xsRev 1d / d": { s: S.xsRev(1), every: 1 },
  "xsRev 3d / 3d": { s: S.xsRev(3), every: 3 },
  "lowVol 30 / w": { s: S.lowVol(30), every: 7 },
  "age / w": { s: S.age(), every: 7 },
  "tsTrend 20 / w": { s: S.tsTrend(20), every: 7 },
  "tsTrend 50 / w": { s: S.tsTrend(50), every: 7 },
  "tsTrend 20 btcF / w": { s: S.tsTrend(20, { btcFilter: true }), every: 7 },
  "tsTrend 50 btcF / w": { s: S.tsTrend(50, { btcFilter: true }), every: 7 },
  "carry 7 / w": { s: S.carry(7), every: 7 },
  "carry 3 / 3d": { s: S.carry(3), every: 3 },
};

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;

async function main(): Promise<void> {
  const useFunding = process.argv.includes("--funding");
  const topN = Number(arg("top") ?? 100);
  const only = arg("only")?.split(",");
  const panel = await loadPanel(useFunding);
  const split = Date.UTC(2025, 0, 1);
  console.log(
    `${panel.symbols.length} coin · ${panel.days.length} kun · universe top ${topN} · xarajat 0.07% · funding ${useFunding ? "bor" : "yo'q"}\n`,
  );
  const years = [...new Set(panel.days.map((t) => new Date(t).getUTCFullYear()))].filter((y) => y >= 2022);
  console.log(
    `${"strategiya".padEnd(22)}  CAGR  Sharpe  maxDD │ train Sh  test Sh │ ${years.map((y) => String(y).padStart(6)).join("")}`,
  );

  for (const [name, { s, every }] of Object.entries(CANDIDATES)) {
    if (only && !only.includes(name)) continue;
    if (name.startsWith("carry") && !useFunding) continue;
    const res = simulate(panel, s, {
      rebalanceEvery: every,
      cost: 0.0007,
      useFunding,
      universe: { topN, minAgeDays: 60 },
    });
    const all = metrics(res.days, res.returns, Date.UTC(2022, 3, 1));
    const train = metrics(res.days, res.returns, Date.UTC(2022, 3, 1), split);
    const test = metrics(res.days, res.returns, split);
    console.log(
      `${name.padEnd(22)} ${pct(all.cagr).padStart(5)} ${all.sharpe.toFixed(2).padStart(7)} ${pct(-all.maxDd).padStart(6)} │ ${train.sharpe
        .toFixed(2)
        .padStart(8)} ${test.sharpe.toFixed(2).padStart(8)} │ ${years.map((y) => pct(all.byYear[y] ?? 0).padStart(6)).join("")}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
