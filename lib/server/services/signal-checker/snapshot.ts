import { calculateATRSeries } from "../indicators.series";
import { calculateEMA, findSwingHighs, findSwingLows, type SwingPoint } from "../indicators.service";
import { computeStructure, type StructureBar, type StructureConfig } from "../fq-strategy/structure";
import type { Candle } from "../../types/index";
import type {
  MarketSnapshot,
  Side,
  SideSnapshot,
  Structure4h,
  SweepInfo,
  TradePlan,
  ZoneInfo,
  ZoneTimeframe,
} from "./types";

/**
 * Shamlardan signal tekshiruvchi snapshot'ini yig'adi. Faqat YOPILGAN shamlar berilishi kerak.
 * Barcha raqamlar shu yerda hisoblanadi — qoidalar ham, AI ham faqat shu JSON'ni o'qiydi.
 */
export const CHECKER_CONFIG = {
  structure: { pivotLeft: 3, pivotRight: 2, obMaxAge: 100, obMaxAtr: 3, sweepMaxAge: 48 } satisfies StructureConfig,
  /** 4H strukturasi uchun pivot kengligi (HH/HL aniqlash). */
  pivot4h: 3,
  /** OB shu shamlar ichida tegilgan bo'lsa "faol" hisoblanadi. */
  obRecentBars: 8,
  fvgLookback: 50,
  srLookback: 100,
  /** SR zonasi kengligi: daraja ± shu ATR. */
  srWidthAtr: 0.3,
  /** Zona chegarasidan tashqarida ruxsat (ATR). */
  zoneToleranceAtr: 0.1,
  /** Sweep shu shamlar ichida (zona TF'ida) bo'lgan bo'lsin. */
  sweepRecentBars: 12,
  /** 5m trigger shu shamlar ichida bo'lgan bo'lsin. */
  triggerRecentBars: 6,
  /** SL sweep soyasidan shu ATR (sweep TF'i) narida. */
  slBufferAtr: 0.1,
  /** Likvidlik topilmasa TP2 shu R da; topilsa ham shu R dan uzoq bo'lmaydi. */
  tp2FallbackR: 2,
  tp2MaxR: 3,
  liquidityLookback: 150,
} as const;

export interface SnapshotInput {
  symbol: string;
  c5m: Candle[];
  c15m: Candle[];
  c1h: Candle[];
  c4h: Candle[];
  /** Kasr ko'rinishida (Binance formati): 0.0001 = 0.01%. */
  fundingRate: number | null;
  newsWithin30min: boolean | null;
  tradesToday: number | null;
  consecutiveLosses: number | null;
}

const round = (x: number) => Number(x.toPrecision(6));

interface TfData<T extends string = ZoneTimeframe> {
  timeframe: T;
  candles: Candle[];
  atr: number[];
  structure: StructureBar[];
}

function prepare<T extends string>(timeframe: T, candles: Candle[]): TfData<T> {
  const atr = calculateATRSeries(candles, 14);
  return { timeframe, candles, atr, structure: computeStructure(candles, atr, CHECKER_CONFIG.structure) };
}

const lastAtr = (atr: number[]) => {
  const a = atr[atr.length - 1];
  return a !== undefined && Number.isFinite(a) ? a : null;
};

export function structure4h(c4h: Candle[]): Structure4h | null {
  const n = CHECKER_CONFIG.pivot4h;
  const highs = findSwingHighs(c4h, n, n);
  const lows = findSwingLows(c4h, n, n);
  if (highs.length < 2 || lows.length < 2) return null;
  const [h1, h2] = highs.slice(-2) as [SwingPoint, SwingPoint];
  const [l1, l2] = lows.slice(-2) as [SwingPoint, SwingPoint];
  if (h2.price > h1.price && l2.price > l1.price) return "HH_HL";
  if (h2.price < h1.price && l2.price < l1.price) return "LH_LL";
  return "MIXED";
}

function inRange(price: number, bottom: number, top: number, tol: number): boolean {
  return price >= bottom - tol && price <= top + tol;
}

/** Narx ichida turgan zona: OB → FVG → SR tartibida. */
function findZone(tf: TfData, side: Side, price: number): ZoneInfo | null {
  const { candles, structure, timeframe } = tf;
  const atr = lastAtr(tf.atr);
  if (atr === null) return null;
  const tol = CHECKER_CONFIG.zoneToleranceAtr * atr;
  const n = candles.length;

  // OB: yaqinda birinchi marta tegilgan, narx hali ichida.
  for (let t = n - 1; t >= Math.max(0, n - CHECKER_CONFIG.obRecentBars); t--) {
    const ob = side === "long" ? structure[t]!.obLong : structure[t]!.obShort;
    if (ob && inRange(price, ob.bottom, ob.top, tol)) {
      return { type: "OB", timeframe, top: round(ob.top), bottom: round(ob.bottom) };
    }
  }

  // FVG: to'lmagan (keyin chegaradan o'tib yopilmagan) eng so'nggi bo'shliq.
  for (let k = n - 2; k >= Math.max(1, n - CHECKER_CONFIG.fvgLookback); k--) {
    const prev = candles[k - 1]!;
    const next = candles[k + 1]!;
    const [bottom, top] = side === "long" ? [prev.high, next.low] : [next.high, prev.low];
    if (top <= bottom) continue;
    const later = candles.slice(k + 2);
    const filled = side === "long" ? later.some((c) => c.close < bottom) : later.some((c) => c.close > top);
    if (!filled && inRange(price, bottom, top, tol)) {
      return { type: "FVG", timeframe, top: round(top), bottom: round(bottom) };
    }
  }

  // SR: close bilan buzilmagan swing low (long) / high (short).
  const start = n - CHECKER_CONFIG.srLookback;
  const pivots = (side === "long" ? findSwingLows(candles, 3, 3) : findSwingHighs(candles, 3, 3))
    .filter((p) => p.index >= start)
    .reverse();
  const w = CHECKER_CONFIG.srWidthAtr * atr;
  for (const p of pivots) {
    const later = candles.slice(p.index + 1);
    const broken = side === "long" ? later.some((c) => c.close < p.price) : later.some((c) => c.close > p.price);
    if (!broken && inRange(price, p.price - w, p.price + w, 0)) {
      return { type: "SR", timeframe, top: round(p.price + w), bottom: round(p.price - w) };
    }
  }
  return null;
}

/** Yaqindagi sweep, keyin narx sweep soyasidan o'tib yopilmagan bo'lsa. */
function findSweep(tf: TfData, side: Side): (SweepInfo & { closeTime: number; atr: number }) | null {
  const { candles, structure } = tf;
  const n = candles.length;
  for (let t = n - 1; t >= Math.max(0, n - CHECKER_CONFIG.sweepRecentBars); t--) {
    const s = side === "long" ? structure[t]!.sweepLong : structure[t]!.sweepShort;
    if (!s) continue;
    const later = candles.slice(t + 1);
    const invalid = side === "long" ? later.some((c) => c.close < s.extreme) : later.some((c) => c.close > s.extreme);
    if (invalid) return null;
    const atr = tf.atr[t];
    return {
      timeframe: tf.timeframe,
      level: round(s.level),
      extreme: round(s.extreme),
      time: new Date(candles[t]!.closeTime).toISOString(),
      closeTime: candles[t]!.closeTime,
      atr: atr !== undefined && Number.isFinite(atr) ? atr : 0,
    };
  }
  return null;
}

/** 5m da `since` dan keyin shu yo'nalishdagi BOS; oldingi bias qarshi bo'lsa — CHoCH. */
function findTrigger(tf5: TfData<"5m">, side: Side, since: number): { choch: boolean; bos: boolean } {
  const { candles, structure } = tf5;
  const n = candles.length;
  let choch = false;
  let bos = false;
  for (let t = n - 1; t >= Math.max(1, n - CHECKER_CONFIG.triggerRecentBars); t--) {
    if (candles[t]!.openTime < since) break;
    const s = structure[t]!;
    const hit = side === "long" ? s.bosUp : s.bosDown;
    if (!hit) continue;
    const prevBias = structure[t - 1]!.bias;
    if (prevBias === (side === "long" ? "bull" : "bear")) bos = true;
    else choch = true;
  }
  return { choch, bos };
}

/** Kirishdan keyingi eng yaqin olinmagan 1H swing high (long) / low (short). */
function nextLiquidity(c1h: Candle[], side: Side, entry: number): number | null {
  const start = c1h.length - CHECKER_CONFIG.liquidityLookback;
  const pivots = (side === "long" ? findSwingHighs(c1h, 3, 3) : findSwingLows(c1h, 3, 3)).filter((p) => p.index >= start);
  let best: number | null = null;
  for (const p of pivots) {
    const later = c1h.slice(p.index + 1);
    if (side === "long") {
      if (p.price <= entry || later.some((c) => c.high > p.price)) continue;
      if (best === null || p.price < best) best = p.price;
    } else {
      if (p.price >= entry || later.some((c) => c.low < p.price)) continue;
      if (best === null || p.price > best) best = p.price;
    }
  }
  return best === null ? null : round(best);
}

function buildPlan(side: Side, entry: number, sweep: { extreme: number; atr: number }, liquidity: number | null): TradePlan | null {
  const dir = side === "long" ? 1 : -1;
  const stop = sweep.extreme - dir * CHECKER_CONFIG.slBufferAtr * sweep.atr;
  const risk = (entry - stop) * dir;
  if (!(risk > 0)) return null;
  const maxTp = entry + dir * CHECKER_CONFIG.tp2MaxR * risk;
  const tp2 =
    liquidity === null ? entry + dir * CHECKER_CONFIG.tp2FallbackR * risk : side === "long" ? Math.min(liquidity, maxTp) : Math.max(liquidity, maxTp);
  return {
    entry: round(entry),
    stop_loss: round(stop),
    tp1: round(entry + dir * risk),
    tp2: round(tp2),
    rr: Math.round((((tp2 - entry) * dir) / risk) * 100) / 100,
  };
}

function sideSnapshot(side: Side, price: number, tf5: TfData<"5m">, tf15: TfData, tf1h: TfData): SideSnapshot {
  const zone = findZone(tf15, side, price) ?? findZone(tf1h, side, price);
  const sweeps = [findSweep(tf15, side), findSweep(tf1h, side)].filter((s) => s !== null);
  // Zona TF'idagi sweep afzal, bo'lmasa eng so'nggisi.
  const sweep = sweeps.find((s) => s.timeframe === zone?.timeframe) ?? sweeps.sort((a, b) => b.closeTime - a.closeTime)[0] ?? null;
  const trigger = sweep ? findTrigger(tf5, side, sweep.closeTime) : { choch: false, bos: false };
  const liquidity = nextLiquidity(tf1h.candles, side, price);
  const plan = sweep ? buildPlan(side, price, sweep, liquidity) : null;
  return {
    zone,
    liquidity_sweep: sweep !== null,
    sweep: sweep ? { timeframe: sweep.timeframe, level: sweep.level, extreme: sweep.extreme, time: sweep.time } : null,
    choch_5m: trigger.choch,
    bos_5m: trigger.bos,
    next_liquidity: liquidity,
    plan,
  };
}

export function buildSnapshot(input: SnapshotInput): MarketSnapshot {
  const last5 = input.c5m[input.c5m.length - 1];
  if (!last5) throw new Error(`${input.symbol}: 5m shamlar yo'q`);
  const price = last5.close;

  const ema = input.c4h.length >= 200 ? calculateEMA(input.c4h.map((c) => c.close), 200).at(-1) : undefined;
  const tf5 = prepare("5m" as const, input.c5m);
  const tf15 = prepare<ZoneTimeframe>("15m", input.c15m);
  const tf1h = prepare<ZoneTimeframe>("1h", input.c1h);

  return {
    symbol: input.symbol,
    time: new Date(last5.closeTime).toISOString(),
    close: round(price),
    ema200_4h: ema !== undefined && Number.isFinite(ema) ? round(ema) : null,
    structure_4h: structure4h(input.c4h),
    atr_5m: (() => {
      const a = lastAtr(tf5.atr);
      return a === null ? null : round(a);
    })(),
    long: sideSnapshot("long", price, tf5, tf15, tf1h),
    short: sideSnapshot("short", price, tf5, tf15, tf1h),
    funding_rate_pct: input.fundingRate === null ? null : round(input.fundingRate * 100),
    news_within_30min: input.newsWithin30min,
    trades_today: input.tradesToday,
    consecutive_losses: input.consecutiveLosses,
  };
}
