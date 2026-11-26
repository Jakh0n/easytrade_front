import { calculateEMA } from "../indicators.service";
import { calculateATRSeries } from "../indicators.series";
import {
  DEFAULT_STRUCTURE_CONFIG,
  computeStructure,
  type StructureBar,
  type StructureConfig,
} from "../fq-strategy/structure";
import type { Candle } from "../../types/index";

/**
 * SMC / OTE kirish modeli (ICT uslubi) — backtest va live bot uchun umumiy.
 *
 * 1. BOS: close oxirgi swing high'dan o'tdi → impuls: swing low L → cho'qqi H.
 * 2. Kirish: impulsning 0.618 retracement darajasida LIMIT order ("OTE").
 * 3. Stop: L ortida (struktura buziladigan joy) + 0.2 ATR.
 * 4. TP1 = H (eski cho'qqi — likvidlik): 50% yopish, stop → BE. TP2 = Fib 1.272 extension.
 * 5. Order bekor: to'lmasdan narx H dan o'tsa yoki 30 sham (4H → 5 kun) o'tsa.
 * 6. Filtr: 1D EMA200 trendi tomonga; impuls 3–15 ATR.
 * Shortlar simmetrik.
 *
 * Backtest (4H, 3 yil, 0.02% maker kirish + 0.07% taker chiqish): 20 ta asosiy coinda
 * train +0.005R / test +0.09R, tanlovda qatnashmagan boshqa 20 coinda +0.05R / +0.10R.
 * Parametrlar natijaga moslashtirilmagan (standart OTE 0.618). Edge kichik, lekin izchil.
 * 1H da ishlamadi; HTF filtrsiz varianti yangi coinlarda zararga o'tdi.
 */
export interface SmcConfig {
  entry: "fib" | "ob";
  entryFib: number;
  tp2Ext: number;
  slBufferAtr: number;
  minLegAtr: number;
  maxLegAtr: number;
  maxWait: number;
  useHtf: boolean;
  /** TP1 eski cho'qqi emas, qat'iy R bo'lsin (null — cho'qqi). */
  tp1R: number | null;
  structure: StructureConfig;
}

export const SMC_CONFIG: SmcConfig = {
  entry: "fib",
  entryFib: 0.618,
  tp2Ext: 0.272,
  slBufferAtr: 0.2,
  minLegAtr: 3,
  maxLegAtr: 15,
  maxWait: 30,
  useHtf: true,
  tp1R: null,
  structure: DEFAULT_STRUCTURE_CONFIG,
};

export interface SmcSetup {
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  /** Narx to'lmasdan shu darajadan o'tsa — order bekor (impuls cho'qqisi/tubi). */
  invalidate: number;
  legHigh: number;
  legLow: number;
  /** BOS shamining indeksi va openTime'i. */
  index: number;
  signalTime: number;
}

export interface SmcSeries {
  candles: Candle[];
  atr: number[];
  structure: StructureBar[];
}

export function computeSmcSeries(candles: Candle[], config: SmcConfig = SMC_CONFIG): SmcSeries {
  const atr = calculateATRSeries(candles, 14);
  return { candles, atr, structure: computeStructure(candles, atr, config.structure) };
}

/** HTF (1D) EMA200 bo'yicha yo'nalish: 1 / -1 / 0. `htf` — faqat yopilgan shamlar. */
export function htfDirection(htf: Candle[], emaLen: number = 200): number {
  if (htf.length < emaLen) return 0;
  const ema = calculateEMA(
    htf.map((c) => c.close),
    emaLen,
  ).at(-1)!;
  const close = htf.at(-1)!.close;
  if (!Number.isFinite(ema)) return 0;
  return close > ema ? 1 : close < ema ? -1 : 0;
}

/** t-shamda (yopilgan) yangi OTE setup bormi. `htfDir` — shu sham yopilgan paytdagi HTF yo'nalishi. */
export function smcSetupAt(
  series: SmcSeries,
  t: number,
  htfDir: number,
  config: SmcConfig = SMC_CONFIG,
): SmcSetup | null {
  const { candles, atr, structure } = series;
  const bar = candles[t];
  const s = structure[t];
  const a = atr[t];
  if (!bar || !s || !Number.isFinite(a)) return null;
  let result: SmcSetup | null = null;

  for (const side of ["long", "short"] as const) {
    const long = side === "long";
    if (!(long ? s.bosUp : s.bosDown)) continue;
    if (config.useHtf && htfDir !== (long ? 1 : -1)) continue;
    const leg = long ? s.legLong : s.legShort;
    if (!leg) continue;
    const H = long ? Math.max(leg.high, bar.high) : leg.high;
    const L = long ? leg.low : Math.min(leg.low, bar.low);
    const size = H - L;
    if (size < config.minLegAtr * a! || size > config.maxLegAtr * a!) continue;

    let entry = long ? H - config.entryFib * size : L + config.entryFib * size;
    if (config.entry === "ob") {
      let k = -1;
      for (let i = long ? leg.lowIndex : leg.highIndex; i < t; i++) {
        if (k < 0 || (long ? candles[i]!.low < candles[k]!.low : candles[i]!.high > candles[k]!.high)) k = i;
      }
      if (k < 0) continue;
      const ob = long ? candles[k]!.high : candles[k]!.low;
      const r = long ? (H - ob) / size : (ob - L) / size;
      if (r < 0.5 || r > 0.9) continue;
      entry = ob;
    }
    const stopLoss = long ? L - config.slBufferAtr * a! : H + config.slBufferAtr * a!;
    const risk = Math.abs(entry - stopLoss);
    const d = long ? 1 : -1;
    result = {
      side,
      entry,
      stopLoss,
      tp1: config.tp1R !== null ? entry + d * risk * config.tp1R : long ? H : L,
      tp2: long ? H + config.tp2Ext * size : L - config.tp2Ext * size,
      invalidate: long ? H : L,
      legHigh: H,
      legLow: L,
      index: t,
      signalTime: bar.openTime,
    };
  }
  return result;
}

export type PendingResolution =
  | { state: "pending" }
  | { state: "cancelled"; reason: "invalidated" | "expired"; at: number }
  | { state: "filled"; index: number; stoppedOnFill: boolean };

/**
 * Limit order holati: `after` — setup shamidan keyingi yopilgan shamlar (eskidan yangiga).
 * To'lgan shamda TP hisoblanmaydi (to'lishdan oldin bo'lgan bo'lishi mumkin) — faqat stop.
 */
export function resolvePending(
  setup: Pick<SmcSetup, "side" | "entry" | "stopLoss" | "invalidate">,
  after: Candle[],
  maxWait: number = SMC_CONFIG.maxWait,
): PendingResolution {
  const long = setup.side === "long";
  for (let j = 0; j < after.length; j++) {
    const c = after[j]!;
    if (long ? c.low <= setup.entry : c.high >= setup.entry) {
      return { state: "filled", index: j, stoppedOnFill: long ? c.low <= setup.stopLoss : c.high >= setup.stopLoss };
    }
    if (long ? c.high > setup.invalidate : c.low < setup.invalidate) {
      return { state: "cancelled", reason: "invalidated", at: c.closeTime };
    }
    if (j + 1 >= maxWait) return { state: "cancelled", reason: "expired", at: c.closeTime };
  }
  return { state: "pending" };
}
