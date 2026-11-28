import { calculateATRSeries } from "../indicators.series";
import { computeStructure, type StructureBar, type StructureConfig } from "../fq-strategy/structure";
import type { Candle } from "../../types/index";

/**
 * Intraday SMC (ICT uslubi) — 5M / 15M:
 * 1. Liquidity sweep: soya oxirgi swing low'dan (long) o'tib, close qaytib ichkarida — stoplar/likvidatsiyalar olindi.
 * 2. `sweepWindow` sham ichida CHoCH/BOS: close oxirgi swing high'dan o'tdi (displacement).
 * 3. Sweep va BOS orasidagi eng so'nggi bullish FVG (low[k+1] > high[k-1]) — LIMIT kirish
 *    (`entryAt`: FVG yuqori cheti yoki o'rtasi "CE").
 * 4. Stop: sweep soyasi ortida + `slBufferAtr` ATR. TP: `tp1R` (50%) / `tp2R`.
 * 5. Filtrlar: HTF (1H EMA200) yo'nalishi, sessiya (UTC soatlari).
 * 6. Bekor: `maxWait` sham ichida to'lmasa yoki narx avval TP1 ga yetsa.
 */
export interface IntradayConfig {
  sweepWindow: number;
  entryAt: "edge" | "ce";
  slBufferAtr: number;
  minRiskAtr: number;
  maxRiskAtr: number;
  tp1R: number;
  tp2R: number;
  maxWait: number;
  /** Savdo ichida ushlab turish chegarasi (sham). */
  maxBars: number;
  useHtf: boolean;
  /** [boshlanish, tugash) UTC soat; null — kun bo'yi. */
  session: [number, number] | null;
  structure: StructureConfig;
}

export const INTRADAY_CONFIG: IntradayConfig = {
  sweepWindow: 12,
  entryAt: "ce",
  slBufferAtr: 0.1,
  minRiskAtr: 0.5,
  maxRiskAtr: 4,
  tp1R: 1,
  tp2R: 2,
  maxWait: 8,
  maxBars: 96,
  useHtf: true,
  session: [7, 17],
  structure: { pivotLeft: 3, pivotRight: 2, obMaxAge: 100, obMaxAtr: 3, sweepMaxAge: 48 },
};

export interface IntradaySetup {
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  fvgTop: number;
  fvgBottom: number;
  sweepLevel: number;
  index: number;
  signalTime: number;
}

export interface IntradaySeries {
  candles: Candle[];
  atr: number[];
  structure: StructureBar[];
}

export function computeIntradaySeries(candles: Candle[], config: IntradayConfig = INTRADAY_CONFIG): IntradaySeries {
  const atr = calculateATRSeries(candles, 14);
  return { candles, atr, structure: computeStructure(candles, atr, config.structure) };
}

/** t — BOS shami. `htfDir` — 1 / -1 / 0 (shu sham yopilgan paytdagi 1H trend). */
export function intradaySetupAt(
  series: IntradaySeries,
  t: number,
  htfDir: number,
  config: IntradayConfig = INTRADAY_CONFIG,
): IntradaySetup | null {
  const { candles, atr, structure } = series;
  const bar = candles[t];
  const s = structure[t];
  const a = atr[t];
  if (!bar || !s || !Number.isFinite(a)) return null;
  if (config.session) {
    const hour = new Date(bar.closeTime + 1).getUTCHours();
    const [from, to] = config.session;
    if (hour < from || hour >= to) return null;
  }

  for (const side of ["long", "short"] as const) {
    const long = side === "long";
    if (!(long ? s.bosUp : s.bosDown)) continue;
    if (config.useHtf && htfDir !== (long ? 1 : -1)) continue;

    // Oxirgi sweep (BOS dan oldin, oyna ichida).
    let sweepIdx = -1;
    for (let k = t - 1; k >= Math.max(0, t - config.sweepWindow); k--) {
      if (long ? structure[k]!.sweepLong : structure[k]!.sweepShort) {
        sweepIdx = k;
        break;
      }
    }
    if (sweepIdx < 0) continue;
    const sweep = (long ? structure[sweepIdx]!.sweepLong : structure[sweepIdx]!.sweepShort)!;

    // Sweep → BOS orasidagi eng so'nggi FVG (BOS shamini ham qo'shib).
    let fvg: { top: number; bottom: number } | null = null;
    for (let k = t - 1; k >= sweepIdx + 1; k--) {
      const prev = candles[k - 1]!;
      const next = candles[k + 1]!;
      if (long ? next.low > prev.high : next.high < prev.low) {
        fvg = long ? { top: next.low, bottom: prev.high } : { top: prev.low, bottom: next.high };
        break;
      }
    }
    if (!fvg) continue;

    const entry = config.entryAt === "edge" ? (long ? fvg.top : fvg.bottom) : (fvg.top + fvg.bottom) / 2;
    const stopLoss = long ? sweep.extreme - config.slBufferAtr * a! : sweep.extreme + config.slBufferAtr * a!;
    const risk = long ? entry - stopLoss : stopLoss - entry;
    if (!(risk >= config.minRiskAtr * a!) || risk > config.maxRiskAtr * a!) continue;
    // Narx allaqachon kirishdan uzoqlashgan bo'lishi kerak (limit hozirgi narxdan "orqada").
    if (long ? bar.close <= entry : bar.close >= entry) continue;
    const d = long ? 1 : -1;
    return {
      side,
      entry,
      stopLoss,
      tp1: entry + d * risk * config.tp1R,
      tp2: entry + d * risk * config.tp2R,
      fvgTop: fvg.top,
      fvgBottom: fvg.bottom,
      sweepLevel: sweep.level,
      index: t,
      signalTime: bar.openTime,
    };
  }
  return null;
}
