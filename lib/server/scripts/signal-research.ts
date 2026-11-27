/**
 * Signal sifati bo'yicha tadqiqot (live sozlamalar + bozor rejimi bilan):
 *
 *   npx tsx lib/server/scripts/signal-research.ts cap        # 1. bir tomonga ochiq signallar cheklovi
 *   npx tsx lib/server/scripts/signal-research.ts features   # 2. har xususiyat kvintillari bo'yicha natija
 *   npx tsx lib/server/scripts/signal-research.ts model      # 3. ehtimollik modeli (walk-forward)
 *   npx tsx lib/server/scripts/signal-research.ts mtf        # 4. yuqori timeframe tasdig'i
 *   npx tsx lib/server/scripts/signal-research.ts final      # tanlangan filtrlar birgalikda + live model og'irliklari
 *
 * Train = vaqt bo'yicha birinchi 70%, test = oxirgi 30%.
 */
import { summarize, type BacktestStats, type BacktestTrade } from "../backtest/fq-backtest";
import {
  INTERVAL_MS,
  LIVE_SPECS,
  applySideCap,
  liveTrades,
  loadCandles,
  loadFunding,
  loadSpecData,
  type SpecData,
} from "../backtest/live-strategies";
import { regimeAt } from "../services/market-regime/engine";
import { calculateEMA } from "../services/indicators.service";
import type { Candle } from "../types/index";
import {
  FEATURE_NAMES,
  buildFeatures,
  computeFeatureSeries,
  fundingAt,
  type FeatureVector,
} from "../services/signal-model/features";
import { fitLogistic, predictProbability } from "../services/signal-model/model";
import { MTF_RULES } from "../services/signal-quality.service";

function fmt(s: BacktestStats): string {
  const pf = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞";
  const ratio = s.maxDrawdownR > 0 ? (s.totalR / s.maxDrawdownR).toFixed(2) : "—";
  return [
    String(s.trades).padStart(5),
    `${s.winRate.toFixed(1)}%`.padStart(6),
    `${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(3)}`.padStart(7),
    pf.padStart(5),
    `${s.totalR >= 0 ? "+" : ""}${s.totalR.toFixed(1)}`.padStart(7),
    s.maxDrawdownR.toFixed(1).padStart(6),
    ratio.padStart(6),
  ].join(" ");
}

export function printRow(name: string, trades: BacktestTrade[], split: number): void {
  const train = trades.filter((t) => t.signalTime < split);
  const test = trades.filter((t) => t.signalTime >= split);
  console.log(`${name.padEnd(18)} │ ${fmt(summarize(train))} │ ${fmt(summarize(test))}`);
}

const HEADER = "trades    win    avgR    PF  totalR  maxDD  R/DD";

async function loadAll(): Promise<SpecData[]> {
  const all: SpecData[] = [];
  for (const spec of LIVE_SPECS) {
    process.stdout.write(`yuklanmoqda ${spec.id}...\n`);
    all.push(await loadSpecData(spec));
  }
  return all;
}

async function capStudy(): Promise<void> {
  const all = await loadAll();
  for (const data of all) {
    const trades = liveTrades(data);
    console.log(`\n═══ ${data.spec.id} ═══`);
    console.log(`${"cap".padEnd(18)} │ TRAIN ${HEADER} │ TEST  ${HEADER}`);
    for (const cap of [Infinity, 8, 5, 3, 2, 1]) {
      printRow(Number.isFinite(cap) ? `max ${cap}/tomon` : "cheklovsiz", applySideCap(trades, cap), data.split);
    }
  }
}

interface Row {
  trade: BacktestTrade;
  f: FeatureVector;
}

async function featureRows(
  data: SpecData,
  extra?: (symbol: string, side: "long" | "short", t: number) => boolean,
): Promise<Row[]> {
  const trades = liveTrades(data, extra);
  const barMs = INTERVAL_MS[data.spec.tf]!;
  const rows: Row[] = [];
  for (const coin of data.coins) {
    const series = computeFeatureSeries(coin.candles);
    const index = new Map(coin.candles.map((c, i) => [c.openTime, i]));
    const funding = await loadFunding(coin.symbol);
    for (const trade of trades.filter((t) => t.symbol === coin.symbol)) {
      const i = index.get(trade.signalTime);
      if (i === undefined) continue;
      const closeTime = coin.candles[i]!.closeTime;
      rows.push({
        trade,
        f: buildFeatures({
          candles: coin.candles,
          series,
          index: i,
          side: trade.side,
          barMs,
          regime: regimeAt(data.regime, closeTime),
          funding: fundingAt(funding, closeTime),
        }),
      });
    }
  }
  return rows.sort((a, b) => a.trade.signalTime - b.trade.signalTime);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;

async function featureStudy(): Promise<void> {
  for (const spec of LIVE_SPECS) {
    const data = await loadSpecData(spec);
    const rows = await featureRows(data);
    const train = rows.filter((r) => r.trade.signalTime < data.split);
    const test = rows.filter((r) => r.trade.signalTime >= data.split);
    console.log(`\n═══ ${spec.id} · ${rows.length} savdo · kvintillar (Q1 past → Q5 yuqori), avgR train | test ═══`);
    for (const name of FEATURE_NAMES) {
      const sorted = train.map((r) => r.f[name]).sort((a, b) => a - b);
      const cuts = [0.2, 0.4, 0.6, 0.8].map((q) => sorted[Math.floor(q * (sorted.length - 1))]!);
      const bucket = (v: number) => cuts.filter((c) => v > c).length;
      const cells = [0, 1, 2, 3, 4].map((q) => {
        const tr = avg(train.filter((r) => bucket(r.f[name]) === q).map((r) => r.trade.netR));
        const te = avg(test.filter((r) => bucket(r.f[name]) === q).map((r) => r.trade.netR));
        return `${Number.isFinite(tr) ? sign(tr) : "   —  "}|${Number.isFinite(te) ? sign(te) : "   —  "}`;
      });
      console.log(`${name.padEnd(10)} ${cells.join("  ")}`);
    }
  }
}

async function modelStudy(): Promise<void> {
  for (const spec of LIVE_SPECS) {
    const data = await loadSpecData(spec);
    const rows = await featureRows(data);
    const train = rows.filter((r) => r.trade.signalTime < data.split);
    const test = rows.filter((r) => r.trade.signalTime >= data.split);
    const model = fitLogistic(
      train.map((r) => r.f),
      train.map((r) => (r.trade.netR > 0 ? 1 : 0)),
      { l2: 5 },
    );
    const pTrain = train.map((r) => predictProbability(model, r.f));
    const pTest = test.map((r) => predictProbability(model, r.f));
    console.log(`\n═══ ${spec.id} · model (train ${train.length} / test ${test.length}) ═══`);
    console.log(
      "og'irliklar:",
      model.features.map((f, j) => `${f} ${model.weights[j]! >= 0 ? "+" : ""}${model.weights[j]!.toFixed(2)}`).join(", "),
    );
    console.log(`${"chegara".padEnd(18)} │ TRAIN ${HEADER} │ TEST  ${HEADER}`);
    // Chegara train ehtimolliklari kvantili bo'yicha: eng past X% signal tashlanadi.
    const sortedP = [...pTrain].sort((a, b) => a - b);
    for (const drop of [0, 0.2, 0.35, 0.5, 0.65]) {
      const cut = drop === 0 ? -Infinity : sortedP[Math.floor(drop * (sortedP.length - 1))]!;
      const keep = [
        ...train.filter((_, i) => pTrain[i]! >= cut),
        ...test.filter((_, i) => pTest[i]! >= cut),
      ].map((r) => r.trade);
      printRow(drop === 0 ? "hammasi" : `p ≥ ${cut.toFixed(3)} (-${drop * 100}%)`, keep, data.split);
    }
  }
}

/** Yuqori TF: har sham uchun [closeTime, EMA50 tomoni, EMA50/200 tartibi]. */
function mtfSeries(candles: Candle[]): { t: number; above50: number; stack: number }[] {
  const closes = candles.map((c) => c.close);
  const e50 = calculateEMA(closes, 50);
  const e200 = calculateEMA(closes, 200);
  return candles.map((c, i) => ({
    t: c.closeTime,
    above50: Number.isFinite(e50[i]!) ? Math.sign(c.close - e50[i]!) : 0,
    stack: Number.isFinite(e200[i]!)
      ? c.close > e200[i]! && e50[i]! > e200[i]!
        ? 1
        : c.close < e200[i]! && e50[i]! < e200[i]!
          ? -1
          : 0
      : 0,
  }));
}

const MTF_TF: Partial<Record<string, string>> = { fq_15m: "1h", st_day: "4h", fq_v3: "1d", fq_4h: "1d", smc_4h: "1d" };

async function mtfStudy(): Promise<void> {
  for (const spec of LIVE_SPECS) {
    const tf = MTF_TF[spec.id];
    if (!tf) continue;
    const data = await loadSpecData(spec);
    const higher = new Map<string, ReturnType<typeof mtfSeries>>();
    for (const c of data.coins) {
      higher.set(c.symbol, mtfSeries(await loadCandles(c.symbol, tf, data.start - 260 * INTERVAL_MS[tf]!)));
    }
    const at = (symbol: string, t: number) => {
      const s = higher.get(symbol)!;
      let lo = 0;
      let hi = s.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (s[mid]!.t <= t) {
          idx = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return idx >= 0 ? s[idx]! : null;
    };
    console.log(`\n═══ ${spec.id} · tasdiq ${tf} ═══`);
    console.log(`${"filtr".padEnd(18)} │ TRAIN ${HEADER} │ TEST  ${HEADER}`);
    const base = liveTrades(data);
    printRow("yo'q", base, data.split);
    const dir = (side: "long" | "short") => (side === "long" ? 1 : -1);
    // Filtr savdo tanlash paytida qo'llanadi (bloklangan signal coinni band qilmaydi — live kabi).
    printRow(`${tf} EMA50 tomoni`, liveTrades(data, (s, side, t) => (at(s, t)?.above50 ?? dir(side)) === dir(side)), data.split);
    printRow(`${tf} EMA50/200`, liveTrades(data, (s, side, t) => (at(s, t)?.stack ?? dir(side)) === dir(side)), data.split);
    printRow(`${tf} qarshi emas`, liveTrades(data, (s, side, t) => (at(s, t)?.stack ?? 0) !== -dir(side)), data.split);
  }
}


async function finalStudy(): Promise<void> {
  for (const spec of LIVE_SPECS) {
    const data = await loadSpecData(spec);
    const mtf = MTF_RULES[spec.id];
    const higher = new Map<string, ReturnType<typeof mtfSeries>>();
    if (mtf) {
      for (const c of data.coins) {
        higher.set(c.symbol, mtfSeries(await loadCandles(c.symbol, mtf.tf, data.start - 260 * INTERVAL_MS[mtf.tf]!)));
      }
    }
    const stackAt = (symbol: string, t: number) => {
      const s = higher.get(symbol) ?? [];
      let idx = -1;
      for (let lo = 0, hi = s.length - 1; lo <= hi; ) {
        const mid = (lo + hi) >> 1;
        if (s[mid]!.t <= t) {
          idx = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return idx >= 0 ? s[idx]!.stack : null;
    };
    const dir = (side: "long" | "short") => (side === "long" ? 1 : -1);
    const extra = mtf
      ? (symbol: string, side: "long" | "short", t: number) => {
          const st = stackAt(symbol, t);
          if (st === null) return true;
          return mtf.rule === "stack" ? st === dir(side) : st !== -dir(side);
        }
      : undefined;

    console.log(`\n═══ ${spec.id} · yakuniy ═══`);
    console.log(`${"variant".padEnd(18)} │ TRAIN ${HEADER} │ TEST  ${HEADER}`);
    printRow("hozirgi live", liveTrades(data), data.split);
    if (mtf) printRow(`+ MTF ${mtf.tf} ${mtf.rule}`, liveTrades(data, extra), data.split);

    if (spec.id === "smc_4h") {
      const rows = await featureRows(data, extra);
      const train = rows.filter((r) => r.trade.signalTime < data.split);
      const test = rows.filter((r) => r.trade.signalTime >= data.split);
      const fit = (rs: Row[]) => fitLogistic(rs.map((r) => r.f), rs.map((r) => (r.trade.netR > 0 ? 1 : 0)), { l2: 5 });
      const wf = fit(train);
      const pTrain = train.map((r) => predictProbability(wf, r.f));
      const sorted = [...pTrain].sort((a, b) => a - b);
      for (const drop of [0.2, 0.35, 0.5]) {
        const cut = sorted[Math.floor(drop * (sorted.length - 1))]!;
        const keep = [...train, ...test].filter((r) => predictProbability(wf, r.f) >= cut).map((r) => r.trade);
        printRow(`+ MTF + model -${drop * 100}%`, keep, data.split);
      }
      // Live uchun: barcha ma'lumotda qayta o'qitilgan model va 35% kvantil chegarasi.
      const full = fit(rows);
      const ps = rows.map((r) => predictProbability(full, r.f)).sort((a, b) => a - b);
      const threshold = ps[Math.floor(0.35 * (ps.length - 1))]!;
      console.log("\nLIVE MODEL JSON:");
      console.log(JSON.stringify({ ...full, threshold }));
    }
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "cap";
  if (mode === "cap") await capStudy();
  else if (mode === "features") await featureStudy();
  else if (mode === "model") await modelStudy();
  else if (mode === "mtf") await mtfStudy();
  else if (mode === "final") await finalStudy();
  else console.log(`Noma'lum rejim: ${mode}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
