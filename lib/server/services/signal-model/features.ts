import { calculateEMA } from "../indicators.service";
import { calculateADXSeries, calculateATRSeries, calculateRSISeries } from "../indicators.series";
import type { RegimeBar } from "../market-regime/engine";
import type { Candle } from "../../types/index";

/**
 * Signal xususiyatlari — signal shami yopilgan paytda ma'lum bo'lgan narsalar (look-ahead yo'q).
 * Hammasi savdo tomoniga yo'naltirilgan: musbat qiymat = savdo tomoni foydasiga
 * (masalan `funding` musbat — olomon ham shu tomonda, ya'ni "gavjum").
 * Live va backtest shu bitta funksiyadan foydalanadi.
 */
export const FEATURE_NAMES = [
  "adx",
  "rsi",
  "atrPct",
  "ext",
  "volRatio",
  "taker1",
  "taker6",
  "ret24",
  "funding",
  "funding7d",
  "regBtc",
  "regAlt",
  "regDom",
  "breadth",
  "hourSin",
  "hourCos",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Record<FeatureName, number>;

export interface FeatureSeries {
  adx: number[];
  rsi: number[];
  atr: number[];
  ema20: number[];
  volSma: number[];
}

export function computeFeatureSeries(candles: Candle[]): FeatureSeries {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const volSma = volumes.map((_, i) => {
    if (i < 19) return NaN;
    let s = 0;
    for (let k = i - 19; k <= i; k++) s += volumes[k]!;
    return s / 20;
  });
  return {
    adx: calculateADXSeries(candles, 14).adx,
    rsi: calculateRSISeries(closes, 14),
    atr: calculateATRSeries(candles, 14),
    ema20: calculateEMA(closes, 20),
    volSma,
  };
}

function takerImbalance(candles: Candle[], from: number, to: number): number {
  let buy = 0;
  let vol = 0;
  for (let k = Math.max(0, from); k <= to; k++) {
    const c = candles[k]!;
    if (c.takerBuyVolume === undefined) return 0;
    buy += c.takerBuyVolume;
    vol += c.volume;
  }
  return vol > 0 ? buy / vol - 0.5 : 0;
}

/** Funding: [vaqt, stavka] o'sish tartibida. `t` gacha bo'lgan oxirgi stavka va 7 kunlik o'rtacha. */
export function fundingAt(funding: { t: number; r: number }[], t: number): { last: number; mean7d: number } {
  let lo = 0;
  let hi = funding.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (funding[mid]!.t <= t) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 0) return { last: 0, mean7d: 0 };
  const since = t - 7 * 86_400_000;
  let s = 0;
  let n = 0;
  for (let k = idx; k >= 0 && funding[k]!.t > since; k--) {
    s += funding[k]!.r;
    n += 1;
  }
  return { last: funding[idx]!.r, mean7d: n ? s / n : 0 };
}

export function buildFeatures(params: {
  candles: Candle[];
  series: FeatureSeries;
  index: number;
  side: "long" | "short";
  barMs: number;
  regime: RegimeBar | null;
  funding: { last: number; mean7d: number };
}): FeatureVector {
  const { candles, series, index: i, side, barMs, regime, funding } = params;
  const d = side === "long" ? 1 : -1;
  const c = candles[i]!;
  const atr = series.atr[i]! || NaN;
  const bars24 = Math.max(1, Math.round(86_400_000 / barMs));
  const past = candles[Math.max(0, i - bars24)]!.close;
  const flag = (f: boolean | null | undefined) => (f === null || f === undefined ? 0 : f ? d : -d);
  const hour = new Date(c.closeTime + 1).getUTCHours();
  const nz = (v: number) => (Number.isFinite(v) ? v : 0);

  return {
    adx: nz(series.adx[i]!),
    rsi: nz(d * (series.rsi[i]! - 50)),
    atrPct: nz((atr / c.close) * 100),
    ext: nz((d * (c.close - series.ema20[i]!)) / atr),
    volRatio: nz(Math.log(c.volume / series.volSma[i]!)),
    taker1: d * takerImbalance(candles, i, i),
    taker6: d * takerImbalance(candles, i - 5, i),
    ret24: nz(d * Math.log(c.close / past) * 100),
    // Funding foizda (0.01% = 1).
    funding: d * funding.last * 10_000,
    funding7d: d * funding.mean7d * 10_000,
    regBtc: flag(regime?.btcUp),
    regAlt: flag(regime?.altUp),
    regDom: flag(regime?.domUp),
    breadth: regime?.breadth === null || regime?.breadth === undefined ? 0 : d * (regime.breadth - 0.5),
    hourSin: Math.sin((2 * Math.PI * hour) / 24),
    hourCos: Math.cos((2 * Math.PI * hour) / 24),
  };
}
