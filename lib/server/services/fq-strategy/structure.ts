import type { Candle } from "../../types/index";

/**
 * Bozor strukturasi (SMC / price action) — har bir sham uchun, faqat o'sha sham yopilganda
 * MA'LUM bo'lgan ma'lumotdan hisoblanadi (look-ahead yo'q):
 *
 * - Pivot (fraktal swing high/low): `left` sham chapda, `right` sham o'ngda. Pivot faqat
 *   `right` sham o'tgach tasdiqlanadi — shu paytgacha undan foydalanilmaydi.
 * - BOS: close oxirgi tasdiqlangan pivotdan o'tdi → struktura yo'nalishi (bias).
 * - Order block: BOS ni keltirib chiqargan harakatning eng past (bull) / eng baland (bear)
 *   shami (LuxAlgo uslubi). Narx unga birinchi marta qaytganda "tegdi" (mitigatsiya).
 * - FVG: 3 shamlik bo'shliq (low[k+1] > high[k-1]) — OB displacement bilan bo'lganini tasdiqlaydi.
 * - Sweep: soya oxirgi swing low/high dan o'tib, close qaytib ichkarida yopildi (stop-hunt).
 * - Impuls to'lqin (Fib uchun): oxirgi tasdiqlangan swing low → shundan keyingi eng yuqori high
 *   (joriy shamgacha, joriy sham kirmaydi).
 */
export interface StructureConfig {
  pivotLeft: number;
  pivotRight: number;
  /** OB shu shamdan eski bo'lsa e'tiborga olinmaydi. */
  obMaxAge: number;
  /** OB balandligi shu ATR karrasidan katta bo'lsa — zona emas, olinmaydi. */
  obMaxAtr: number;
  /** Sweep qilingan pivot shu shamdan eski bo'lmasin. */
  sweepMaxAge: number;
}

export const DEFAULT_STRUCTURE_CONFIG: StructureConfig = {
  pivotLeft: 5,
  pivotRight: 3,
  obMaxAge: 150,
  obMaxAtr: 2.5,
  sweepMaxAge: 60,
};

export interface Zone {
  top: number;
  bottom: number;
  /** OB shamining indeksi. */
  index: number;
  /** BOS sodir bo'lgan sham (OB shundan keyin kuchga kiradi). */
  createdAt: number;
  /** Displacement FVG qoldirganmi. */
  fvg: boolean;
}

export interface Leg {
  low: number;
  high: number;
  lowIndex: number;
  highIndex: number;
}

export interface Sweep {
  level: number;
  /** Long uchun shamning low'i, short uchun high'i. */
  extreme: number;
}

export interface StructureBar {
  /** Oxirgi BOS yo'nalishi (shu sham close'i ham hisobga olingan). */
  bias: "bull" | "bear" | null;
  bosUp: boolean;
  bosDown: boolean;
  /** Shu shamda birinchi marta tegilgan bull OB (low ≤ top, close ≥ bottom). */
  obLong: Zone | null;
  obShort: Zone | null;
  sweepLong: Sweep | null;
  sweepShort: Sweep | null;
  /** Long uchun impuls (swing low → keyingi high). */
  legLong: Leg | null;
  /** Short uchun impuls (swing high → keyingi low). */
  legShort: Leg | null;
}

interface Pivot {
  price: number;
  index: number;
  broken: boolean;
}

function hasBullFvg(candles: Candle[], from: number, to: number): boolean {
  for (let k = Math.max(1, from); k + 1 <= to; k++) {
    if (candles[k + 1]!.low > candles[k - 1]!.high) return true;
  }
  return false;
}

function hasBearFvg(candles: Candle[], from: number, to: number): boolean {
  for (let k = Math.max(1, from); k + 1 <= to; k++) {
    if (candles[k + 1]!.high < candles[k - 1]!.low) return true;
  }
  return false;
}

/**
 * Har bir sham uchun struktura holati. `atr` — o'sha shamlar uchun ATR qatori (OB o'lchami filtri).
 * O(n · (left + right + obMaxAge)) — 20k sham uchun bir necha ms.
 */
export function computeStructure(
  candles: Candle[],
  atr: number[],
  config: StructureConfig = DEFAULT_STRUCTURE_CONFIG,
): StructureBar[] {
  const { pivotLeft: L, pivotRight: R } = config;
  const out: StructureBar[] = [];

  let lastPH: Pivot | null = null;
  let lastPL: Pivot | null = null;
  let bias: StructureBar["bias"] = null;
  let bullObs: Zone[] = [];
  let bearObs: Zone[] = [];
  // Impuls: lastPL dan keyin (joriy shamgacha) eng yuqori high va aksincha.
  let legHigh = -Infinity;
  let legHighIndex = -1;
  let legLow = Infinity;
  let legLowIndex = -1;

  for (let t = 0; t < candles.length; t++) {
    const bar = candles[t]!;
    const a = atr[t];

    // ── 1) Joriy shamning mavjud zonalar/pivotlar bilan o'zaro ta'siri (t dan oldingi holat) ──
    const legLong: Leg | null =
      lastPL && legHighIndex > lastPL.index
        ? { low: lastPL.price, high: legHigh, lowIndex: lastPL.index, highIndex: legHighIndex }
        : null;
    const legShort: Leg | null =
      lastPH && legLowIndex > lastPH.index
        ? { high: lastPH.price, low: legLow, lowIndex: legLowIndex, highIndex: lastPH.index }
        : null;

    let obLong: Zone | null = null;
    bullObs = bullObs.filter((z) => {
      if (t - z.createdAt > config.obMaxAge) return false;
      if (bar.low > z.top) return true; // hali tegilmagan
      if (bar.close >= z.bottom && (!obLong || z.createdAt > obLong.createdAt)) obLong = z;
      return false; // birinchi tegishda mitigatsiya (yoki close ostida — bekor)
    });
    let obShort: Zone | null = null;
    bearObs = bearObs.filter((z) => {
      if (t - z.createdAt > config.obMaxAge) return false;
      if (bar.high < z.bottom) return true;
      if (bar.close <= z.top && (!obShort || z.createdAt > obShort.createdAt)) obShort = z;
      return false;
    });

    const sweepLong: Sweep | null =
      lastPL && !lastPL.broken && t - lastPL.index <= config.sweepMaxAge && bar.low < lastPL.price && bar.close > lastPL.price
        ? { level: lastPL.price, extreme: bar.low }
        : null;
    const sweepShort: Sweep | null =
      lastPH && !lastPH.broken && t - lastPH.index <= config.sweepMaxAge && bar.high > lastPH.price && bar.close < lastPH.price
        ? { level: lastPH.price, extreme: bar.high }
        : null;

    // ── 2) BOS (close bilan) va yangi OB ──
    let bosUp = false;
    let bosDown = false;
    if (lastPH && !lastPH.broken && bar.close > lastPH.price) {
      lastPH.broken = true;
      bosUp = true;
      bias = "bull";
      // Pivot va BOS orasidagi eng past sham — harakat boshlangan joy.
      let k = -1;
      for (let i = lastPH.index + 1; i < t; i++) if (k < 0 || candles[i]!.low < candles[k]!.low) k = i;
      if (k >= 0 && Number.isFinite(a) && candles[k]!.high - candles[k]!.low <= config.obMaxAtr * a!) {
        bullObs.push({ top: candles[k]!.high, bottom: candles[k]!.low, index: k, createdAt: t, fvg: hasBullFvg(candles, k + 1, t) });
      }
    }
    if (lastPL && !lastPL.broken && bar.close < lastPL.price) {
      lastPL.broken = true;
      bosDown = true;
      bias = "bear";
      let k = -1;
      for (let i = lastPL.index + 1; i < t; i++) if (k < 0 || candles[i]!.high > candles[k]!.high) k = i;
      if (k >= 0 && Number.isFinite(a) && candles[k]!.high - candles[k]!.low <= config.obMaxAtr * a!) {
        bearObs.push({ top: candles[k]!.high, bottom: candles[k]!.low, index: k, createdAt: t, fvg: hasBearFvg(candles, k + 1, t) });
      }
    }

    out.push({ bias, bosUp, bosDown, obLong, obShort, sweepLong, sweepShort, legLong, legShort });

    // ── 3) Keyingi sham uchun holatni yangilash: impuls ekstremumlari va pivot tasdig'i ──
    if (bar.high > legHigh) {
      legHigh = bar.high;
      legHighIndex = t;
    }
    if (bar.low < legLow) {
      legLow = bar.low;
      legLowIndex = t;
    }

    const p = t - R;
    if (p >= L) {
      const ph = candles[p]!.high;
      const pl = candles[p]!.low;
      let isHigh = true;
      let isLow = true;
      for (let i = p - L; i <= t && (isHigh || isLow); i++) {
        if (i === p) continue;
        const c = candles[i]!;
        if (i < p ? c.high >= ph : c.high > ph) isHigh = false;
        if (i < p ? c.low <= pl : c.low < pl) isLow = false;
      }
      if (isHigh) {
        lastPH = { price: ph, index: p, broken: candles.slice(p + 1, t + 1).some((c) => c.close > ph) };
        // Short impuls shu swing high'dan boshlanadi.
        legLow = Infinity;
        legLowIndex = -1;
        for (let i = p + 1; i <= t; i++) {
          if (candles[i]!.low < legLow) {
            legLow = candles[i]!.low;
            legLowIndex = i;
          }
        }
      }
      if (isLow) {
        lastPL = { price: pl, index: p, broken: candles.slice(p + 1, t + 1).some((c) => c.close < pl) };
        legHigh = -Infinity;
        legHighIndex = -1;
        for (let i = p + 1; i <= t; i++) {
          if (candles[i]!.high > legHigh) {
            legHigh = candles[i]!.high;
            legHighIndex = i;
          }
        }
      }
    }
  }

  return out;
}

/** Narxning impulsdagi retracement darajasi: 0 = impuls cho'qqisi, 1 = impuls boshi. */
export function retracement(leg: Leg, price: number, side: "long" | "short"): number {
  const size = leg.high - leg.low;
  if (size <= 0) return NaN;
  return side === "long" ? (leg.high - price) / size : (price - leg.low) / size;
}
