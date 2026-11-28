import { calculateATRSeries } from "../indicators.series";
import { calculateEMA, findSwingHighs, findSwingLows } from "../indicators.service";
import { computeStructure } from "../fq-strategy/structure";
import type { Candle } from "../../types/index";

/**
 * SMC MTF (4H → 1H → 5m) — bosqichma-bosqich, deterministik:
 *
 * 1. 4H yo'nalish: close vs EMA200 + oxirgi ikki swing (HH+HL / LH+LL). Oxirgi 4H shamida
 *    trendga qarshi BOS bo'lsa — trend buzilgan.
 * 2. 1H: trend yo'nalishidagi mitigatsiya bo'lmagan FVG / OB (eng yaqini; OB+FVG ustma-ust bo'lsa — OB,
 *    "confluence"), keyin oxirgi 1H swing low (long) sweep'i — soya ostida, close ustida.
 * 3. 5m: sweep'dan keyin CHoCH (oxirgi lower high'dan yuqorida close). Kirish — CHoCH harakati
 *    qoldirgan 5m FVG, bo'lmasa OB, bo'lmasa CHoCH shamining 50% (retestda limit).
 * 4. SL sweep soyasi ortida (max(0.1%, 0.2×ATR 1H) bufer), TP1 = 1R (50%), TP2 = keyingi olinmagan
 *    1H likvidlik (topilmasa 3R, ko'pi bilan 4R). R:R (TP2 bo'yicha) ≥ 2.
 * 5. Filtrlar: yangilik → NO_TRADE, |funding| > 0.05% → ogohlantirish, kunlik limit → NO_TRADE.
 *
 * SHORT tomoni LONG mantiqining ko'zgu aksi: narxlar teskari qilinadi (p → -p, high ↔ low), shu
 * bilan ikkala tomon uchun bitta kod ishlaydi va natija qaytarilganda yana teskari qilinadi.
 * Faqat YOPILGAN shamlar berilishi kerak.
 */
export const MTF_CONFIG = {
  ema4h: 200,
  /** 4H swing (fraktal) kengligi: chap/o'ngdagi shu shamlardan baland/past. */
  pivot4h: 3,
  /** 1H swing kengligi (sweep va likvidlik uchun). */
  pivot1h: 3,
  /** 1H zonalar shu shamlar ichida paydo bo'lgan bo'lsin. */
  zoneLookback: 120,
  /** Juda kichik FVG (ATR ulushida) olinmaydi. */
  minFvgAtr: 0.1,
  /** OB balandligi shu ATR dan katta bo'lsa — zona emas. */
  maxObAtr: 3,
  /** "Kuchli BOS": BOS shami tanasi ≥ shu ATR yoki harakat FVG qoldirgan. */
  strongBosBodyAtr: 1,
  /** Zonaga birinchi tegish shu 1H shamlar ichida bo'lsa — "narx zonada"; undan eski — mitigatsiya bo'lgan. */
  touchRecentBars: 6,
  /** Sweep shu 1H shamlar ichida bo'lsin. */
  sweepRecentBars: 6,
  /** 5m CHoCH shu shamlar ichida bo'lsin (eskirgan trigger olinmaydi). */
  triggerMaxAge: 12,
  structure5m: { pivotLeft: 3, pivotRight: 2, obMaxAge: 100, obMaxAtr: 3, sweepMaxAge: 48 },
  slBufferPct: 0.001,
  slBufferAtr: 0.2,
  minRR: 2,
  highRR: 3,
  tp2FallbackR: 3,
  tp2MaxR: 4,
  liquidityLookback: 150,
  fundingWarnPct: 0.05,
  maxTradesPerDay: 3,
  maxConsecutiveLosses: 2,
  /** Pozitsiya hajmi shu foiz risk uchun hisoblanadi (depozitga nisbatan). */
  riskPct: 1,
} as const;

export type MtfDecision = "LONG" | "SHORT" | "WAIT" | "NO_TRADE";
export type MtfZoneType = "FVG" | "OB";
export type MtfEntryType = "FVG" | "OB" | "CHOCH_50" | "MARKET";

export interface MtfInput {
  symbol: string;
  c4h: Candle[];
  c1h: Candle[];
  c5m: Candle[];
  /** Kasr (Binance formati): 0.0001 = 0.01%. */
  fundingRate: number | null;
  newsWithin30min: boolean;
  tradesToday: number;
  consecutiveLosses: number;
}

export interface MtfResult {
  decision: MtfDecision;
  symbol: string;
  /** Oxirgi yopilgan 5m shamning yopilish vaqti (ISO). */
  time: string;
  price: number;
  checks: {
    trend_4h: boolean;
    zone_1h: boolean;
    sweep_1h: boolean;
    trigger_5m: boolean;
    risk_reward_ok: boolean;
    filters_ok: boolean;
  };
  trend_4h: "LONG" | "SHORT" | "NONE";
  zone_1h: { type: MtfZoneType | null; low: number | null; high: number | null; confluence: boolean };
  sweep: { level: number; extreme: number; time: string } | null;
  entry: number | null;
  entry_type: MtfEntryType | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  /** `riskPct` risk uchun pozitsiya hajmi — depozit karrasi (masalan 2.5 → depozit × 2.5). */
  position_size: number | null;
  invalidation: string;
  confidence: "low" | "medium" | "high" | null;
  reason: string;
  wait_for: string | null;
  warnings: string[];
}

// ───────────── Yordamchilar ─────────────

const round = (x: number) => Number(x.toPrecision(6));

/** Narx o'qini teskari qiladi: SHORT tahlili LONG kodida bajariladi. */
export function mirror(candles: Candle[]): Candle[] {
  return candles.map((c) => ({ ...c, open: -c.open, close: -c.close, high: -c.low, low: -c.high }));
}

const finite = (x: number | undefined): x is number => x !== undefined && Number.isFinite(x);

// ───────────── 1-bosqich: 4H ─────────────

export type Structure = "HH_HL" | "LH_LL" | "MIXED";

export function swingStructure(candles: Candle[], pivot: number): Structure | null {
  const highs = findSwingHighs(candles, pivot, pivot);
  const lows = findSwingLows(candles, pivot, pivot);
  if (highs.length < 2 || lows.length < 2) return null;
  const [h1, h2] = highs.slice(-2);
  const [l1, l2] = lows.slice(-2);
  if (h2!.price > h1!.price && l2!.price > l1!.price) return "HH_HL";
  if (h2!.price < h1!.price && l2!.price < l1!.price) return "LH_LL";
  return "MIXED";
}

export interface Trend4h {
  side: "long" | "short" | null;
  reason: string;
}

export function trend4h(c4h: Candle[]): Trend4h {
  if (c4h.length < MTF_CONFIG.ema4h) return { side: null, reason: "4H ma'lumoti yetarli emas (EMA200 uchun kamida 200 sham)" };
  const ema = calculateEMA(c4h.map((c) => c.close), MTF_CONFIG.ema4h).at(-1);
  const structure = swingStructure(c4h, MTF_CONFIG.pivot4h);
  const last = c4h[c4h.length - 1]!;
  if (!finite(ema) || structure === null) return { side: null, reason: "4H EMA200 yoki struktura aniqlanmadi" };

  const side = last.close > ema && structure === "HH_HL" ? "long" : last.close < ema && structure === "LH_LL" ? "short" : null;
  const ctx = `close ${round(last.close)}, EMA200 ${round(ema)}, struktura ${structure}`;
  if (!side) return { side: null, reason: `4H trend aniq emas yoki range (${ctx})` };

  // Oxirgi 4H shamida trendga qarshi BOS — trend buzilgan.
  const atr = calculateATRSeries(c4h, 14);
  const bar = computeStructure(c4h, atr, { ...MTF_CONFIG.structure5m, pivotLeft: MTF_CONFIG.pivot4h, pivotRight: MTF_CONFIG.pivot4h }).at(-1);
  if (bar && (side === "long" ? bar.bosDown : bar.bosUp)) {
    return { side: null, reason: `Oxirgi 4H shamida trendga qarshi BOS — trend buzilgan (${ctx})` };
  }
  return { side, reason: `4H ${side === "long" ? "LONG" : "SHORT"} (${ctx})` };
}

// ───────────── 2-bosqich: 1H zona va sweep (LONG ko'rinishida) ─────────────

export interface Zone1h {
  type: MtfZoneType;
  low: number;
  high: number;
  /** Zona kuchga kirgan sham (FVG — 3-sham, OB — BOS shami). */
  createdAt: number;
  /** Birinchi tegish (low ≤ high) indeksi; null — hali tegilmagan. */
  firstTouch: number | null;
  confluence: boolean;
}

/** Bullish FVG'lar: 1-sham high < 3-sham low, keyin close bilan buzilmagan. */
export function bullishFvgs(candles: Candle[], atr: number[], from: number): Zone1h[] {
  const out: Zone1h[] = [];
  for (let k = Math.max(1, from); k + 1 < candles.length; k++) {
    const low = candles[k - 1]!.high;
    const high = candles[k + 1]!.low;
    const a = atr[k + 1];
    if (!(high > low) || !finite(a) || high - low < MTF_CONFIG.minFvgAtr * a) continue;
    out.push(withTouch(candles, { type: "FVG", low, high, createdAt: k + 1, firstTouch: null, confluence: false }));
  }
  return out;
}

/** Bullish OB: kuchli yuqoriga BOS'dan oldingi oxirgi qizil sham. */
export function bullishObs(candles: Candle[], atr: number[], from: number): Zone1h[] {
  const L = MTF_CONFIG.pivot1h;
  const out: Zone1h[] = [];
  const highs = findSwingHighs(candles, L, L);
  const broken = new Set<number>();
  for (let t = Math.max(from, 1); t < candles.length; t++) {
    const bar = candles[t]!;
    // Shu shamgacha tasdiqlangan (o'ngida L sham bor) oxirgi buzilmagan swing high.
    const pivot = [...highs].reverse().find((p) => p.index + L < t);
    if (!pivot || broken.has(pivot.index) || bar.close <= pivot.price) continue;
    broken.add(pivot.index);

    let k = pivot.index + 1; // impuls boshlangan joy — eng past sham
    for (let i = pivot.index + 1; i < t; i++) if (candles[i]!.low < candles[k]!.low) k = i;
    let ob = -1; // k va undan oldingi oxirgi qizil sham
    for (let i = k; i >= Math.max(0, k - 5); i--) {
      if (candles[i]!.close < candles[i]!.open) {
        ob = i;
        break;
      }
    }
    const a = atr[t];
    if (ob < 0 || !finite(a)) continue;
    const c = candles[ob]!;
    if (c.high - c.low > MTF_CONFIG.maxObAtr * a) continue;
    let fvg = false;
    for (let i = ob + 1; i + 1 <= t; i++) if (candles[i + 1]!.low > candles[i - 1]!.high) fvg = true;
    const strong = fvg || Math.abs(bar.close - bar.open) >= MTF_CONFIG.strongBosBodyAtr * a;
    if (!strong) continue;
    out.push(withTouch(candles, { type: "OB", low: c.low, high: c.high, createdAt: t, firstTouch: null, confluence: false }));
  }
  return out;
}

/** Birinchi tegishni topadi; close zona ostida yopilgan bo'lsa (buzilgan) — null. */
function withTouch(candles: Candle[], zone: Zone1h): Zone1h {
  for (let j = zone.createdAt + 1; j < candles.length; j++) {
    const c = candles[j]!;
    if (c.close < zone.low) return { ...zone, firstTouch: -1 }; // buzilgan
    if (zone.firstTouch === null && c.low <= zone.high) zone = { ...zone, firstTouch: j };
  }
  return zone;
}

const overlaps = (a: Zone1h, b: Zone1h) => a.low <= b.high && b.low <= a.high;

export interface ZonePick {
  /** "active" — narx zonada (yaqinda birinchi marta tegdi), "ahead" — hali yetib kelmagan. */
  state: "active" | "ahead";
  zone: Zone1h;
}

/** Narxga eng yaqin, mitigatsiya bo'lmagan zona. OB va FVG ustma-ust tushsa — OB (confluence). */
export function pickZone(candles: Candle[], atr: number[]): ZonePick | null {
  const n = candles.length;
  const from = n - MTF_CONFIG.zoneLookback;
  const price = candles[n - 1]!.close;
  const all = [...bullishObs(candles, atr, from), ...bullishFvgs(candles, atr, from)].filter((z) => z.firstTouch !== -1);

  const active = all.filter((z) => z.firstTouch !== null && n - 1 - z.firstTouch < MTF_CONFIG.touchRecentBars);
  const ahead = all.filter((z) => z.firstTouch === null && z.high < price);
  for (const [state, list] of [["active", active], ["ahead", ahead]] as const) {
    if (list.length === 0) continue;
    // Eng yaqini: zona yuqori cheti narxga eng yaqin (active'da — eng yangisi).
    const sorted = [...list].sort((a, b) => b.high - a.high || b.createdAt - a.createdAt);
    let zone = sorted[0]!;
    const partner = list.find((z) => z.type !== zone.type && overlaps(z, zone));
    if (partner) zone = { ...(zone.type === "OB" ? zone : partner), confluence: true };
    return { state, zone };
  }
  return null;
}

export interface Sweep1h {
  index: number;
  level: number;
  extreme: number;
}

/** Zonaga tekkandan keyin oxirgi 1H swing low sweep'i (soya ostida, close ustida), keyin buzilmagan. */
export function findSweep(candles: Candle[], since: number): Sweep1h | null {
  const L = MTF_CONFIG.pivot1h;
  const n = candles.length;
  const lows = findSwingLows(candles, L, L);
  for (let t = n - 1; t >= Math.max(since, n - MTF_CONFIG.sweepRecentBars, 1); t--) {
    const bar = candles[t]!;
    const pivot = [...lows].reverse().find((p) => p.index + L < t);
    if (!pivot) continue;
    // Swing low sweep'gacha close bilan buzilmagan bo'lsin.
    if (candles.slice(pivot.index + 1, t).some((c) => c.close < pivot.price)) continue;
    if (!(bar.low < pivot.price && bar.close > pivot.price)) continue;
    if (candles.slice(t + 1).some((c) => c.close < bar.low)) return null; // sweep soyasi buzildi
    return { index: t, level: pivot.price, extreme: bar.low };
  }
  return null;
}

// ───────────── 3-bosqich: 5m trigger ─────────────

export interface Trigger5m {
  chochIndex: number;
  entry: number;
  entryType: MtfEntryType;
}

/** `since` (sweep 1H shamining openTime) dan keyingi 5m eng past nuqtadan so'ng CHoCH. */
export function findTrigger(c5m: Candle[], since: number): Trigger5m | null {
  const n = c5m.length;
  const start = c5m.findIndex((c) => c.openTime >= since);
  if (start < 0) return null;
  let low = start;
  for (let i = start; i < n; i++) if (c5m[i]!.low < c5m[low]!.low) low = i;

  const structure = computeStructure(c5m, calculateATRSeries(c5m, 14), MTF_CONFIG.structure5m);
  let t = -1;
  for (let i = low + 1; i < n; i++) {
    if (structure[i]!.bosUp) {
      t = i;
      break;
    }
  }
  if (t < 0 || n - 1 - t > MTF_CONFIG.triggerMaxAge) return null;

  // CHoCH harakati qoldirgan FVG (eng so'nggisi) → OB → CHoCH shamining 50%.
  let entry: number | null = null;
  let entryType: MtfEntryType = "CHOCH_50";
  for (let k = t; k - 1 >= low && entry === null; k--) {
    if (k + 1 <= t && c5m[k + 1]!.low > c5m[k - 1]!.high) {
      entry = c5m[k + 1]!.low;
      entryType = "FVG";
    }
  }
  if (entry === null) {
    for (let i = t - 1; i >= low; i--) {
      if (c5m[i]!.close < c5m[i]!.open) {
        entry = c5m[i]!.high;
        entryType = "OB";
        break;
      }
    }
  }
  if (entry === null) entry = (c5m[t]!.high + c5m[t]!.low) / 2;

  // Narx allaqachon kirish darajasida yoki ostida — market.
  const price = c5m[n - 1]!.close;
  if (price <= entry) return { chochIndex: t, entry: price, entryType: "MARKET" };
  return { chochIndex: t, entry, entryType };
}

// ───────────── 4-bosqich: darajalar ─────────────

/** Kirishdan yuqoridagi eng yaqin olinmagan 1H swing high. */
export function nextLiquidity(c1h: Candle[], entry: number): number | null {
  const L = MTF_CONFIG.pivot1h;
  const start = c1h.length - MTF_CONFIG.liquidityLookback;
  let best: number | null = null;
  for (const p of findSwingHighs(c1h, L, L)) {
    if (p.index < start || p.price <= entry) continue;
    if (c1h.slice(p.index + 1).some((c) => c.high > p.price)) continue;
    if (best === null || p.price < best) best = p.price;
  }
  return best;
}

export interface Levels {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  rr: number;
}

export function buildLevels(entry: number, sweepExtreme: number, atr1h: number, liquidity: number | null): Levels | null {
  const buffer = Math.max(MTF_CONFIG.slBufferPct * Math.abs(sweepExtreme), MTF_CONFIG.slBufferAtr * atr1h);
  const stopLoss = sweepExtreme - buffer;
  const risk = entry - stopLoss;
  if (!(risk > 0)) return null;
  const tp2 =
    liquidity === null ? entry + MTF_CONFIG.tp2FallbackR * risk : Math.min(liquidity, entry + MTF_CONFIG.tp2MaxR * risk);
  const tp1 = entry + risk;
  if (!(stopLoss < entry && entry < tp1 && tp1 <= tp2)) return null;
  return { entry, stopLoss, tp1, tp2, rr: Math.round(((tp2 - entry) / risk) * 100) / 100 };
}

// ───────────── Yakuniy baholash ─────────────

function emptyResult(input: MtfInput, price: number, time: string): MtfResult {
  return {
    decision: "NO_TRADE",
    symbol: input.symbol,
    time,
    price: round(price),
    checks: { trend_4h: false, zone_1h: false, sweep_1h: false, trigger_5m: false, risk_reward_ok: false, filters_ok: false },
    trend_4h: "NONE",
    zone_1h: { type: null, low: null, high: null, confluence: false },
    sweep: null,
    entry: null,
    entry_type: null,
    stop_loss: null,
    tp1: null,
    tp2: null,
    rr: null,
    position_size: null,
    invalidation: "",
    confidence: null,
    reason: "",
    wait_for: null,
    warnings: [],
  };
}

export function evaluateMtf(input: MtfInput): MtfResult {
  const last5 = input.c5m[input.c5m.length - 1];
  if (!last5) throw new Error(`${input.symbol}: 5m shamlar yo'q`);
  const r = emptyResult(input, last5.close, new Date(last5.closeTime).toISOString());
  const steps: string[] = [];
  const stop = (reason: string, decision: MtfDecision = "NO_TRADE", waitFor: string | null = null): MtfResult => {
    steps.push(reason);
    return { ...r, decision, reason: steps.join(" → "), wait_for: waitFor };
  };

  // 5-bosqich (qat'iy taqiqlar) — eng arzon tekshiruv, birinchi.
  const fundingPct = input.fundingRate === null ? null : round(input.fundingRate * 100);
  if (fundingPct === null) r.warnings.push("Funding rate noma'lum");
  else if (Math.abs(fundingPct) > MTF_CONFIG.fundingWarnPct) r.warnings.push(`Funding yuqori: ${fundingPct}%`);
  if (input.newsWithin30min) return stop("30 daqiqa ichida muhim yangilik — savdo yo'q");
  if (input.tradesToday >= MTF_CONFIG.maxTradesPerDay || input.consecutiveLosses >= MTF_CONFIG.maxConsecutiveLosses) {
    return stop(`Kunlik limit: bugun ${input.tradesToday} savdo, ketma-ket ${input.consecutiveLosses} zarar`);
  }
  r.checks.filters_ok = true;

  // 1-bosqich.
  const trend = trend4h(input.c4h);
  if (!trend.side) return stop(trend.reason);
  r.checks.trend_4h = true;
  r.trend_4h = trend.side === "long" ? "LONG" : "SHORT";
  steps.push(trend.reason);

  const long = trend.side === "long";
  const sign = long ? 1 : -1;
  const back = (x: number) => round(sign * x);
  const c1h = long ? input.c1h : mirror(input.c1h);
  const c5m = long ? input.c5m : mirror(input.c5m);
  const atr1h = calculateATRSeries(c1h, 14);

  // 2-bosqich.
  const pick = pickZone(c1h, atr1h);
  if (!pick) return stop(`1H da ${long ? "bullish" : "bearish"} mitigatsiya bo'lmagan FVG/OB yo'q`);
  const z = pick.zone;
  const [zLow, zHigh] = long ? [z.low, z.high] : [-z.high, -z.low];
  r.zone_1h = { type: z.type, low: round(zLow), high: round(zHigh), confluence: z.confluence };
  r.checks.zone_1h = true;
  const zoneText = `1H ${z.confluence ? "OB+FVG" : z.type} ${round(zLow)}–${round(zHigh)}`;
  if (pick.state === "ahead") return stop(`${zoneText} — narx hali yetib kelmagan`, "WAIT", `zonaga yaqinlashish kutilmoqda (${zoneText})`);
  steps.push(`narx ${zoneText} zonasida`);

  const sweep = findSweep(c1h, z.firstTouch!);
  if (!sweep) {
    return stop(`1H swing ${long ? "low" : "high"} sweep bo'lmagan`, "WAIT", `1H likvidlik sweep kutilmoqda (zona ${zoneText})`);
  }
  r.checks.sweep_1h = true;
  const sweepBar = c1h[sweep.index]!;
  r.sweep = { level: back(sweep.level), extreme: back(sweep.extreme), time: new Date(sweepBar.closeTime).toISOString() };
  steps.push(`1H swing ${long ? "low" : "high"} ${back(sweep.level)} sweep qilindi (soya ${back(sweep.extreme)})`);

  // 3-bosqich.
  const trigger = findTrigger(c5m, sweepBar.openTime);
  if (!trigger) return stop("5m CHoCH hali yo'q", "WAIT", "5m CHoCH kutilmoqda");
  r.checks.trigger_5m = true;
  steps.push(`5m CHoCH tasdiqladi, kirish ${trigger.entryType}`);

  // 4-bosqich.
  const a1h = atr1h[c1h.length - 1];
  const levels = buildLevels(trigger.entry, sweep.extreme, finite(a1h) ? a1h : 0, nextLiquidity(c1h, trigger.entry));
  if (!levels) return stop("SL/TP darajalari mantiqsiz (SL kirishdan o'tib ketgan)");
  r.entry = back(levels.entry);
  r.entry_type = trigger.entryType;
  r.stop_loss = back(levels.stopLoss);
  r.tp1 = back(levels.tp1);
  r.tp2 = back(levels.tp2);
  r.rr = levels.rr;
  const riskPct = (Math.abs(levels.entry - levels.stopLoss) / Math.abs(levels.entry)) * 100;
  r.position_size = Math.round((MTF_CONFIG.riskPct / riskPct) * 100) / 100;
  if (levels.rr < MTF_CONFIG.minRR) {
    r.entry = r.stop_loss = r.tp1 = r.tp2 = r.position_size = null;
    return stop(`R:R ${levels.rr} < ${MTF_CONFIG.minRR} — keyingi likvidlik juda yaqin`);
  }
  r.checks.risk_reward_ok = true;

  const confidence =
    r.warnings.length > 0 ? "low" : z.confluence && levels.rr >= MTF_CONFIG.highRR ? "high" : "medium";
  return {
    ...r,
    decision: long ? "LONG" : "SHORT",
    confidence,
    invalidation:
      `1H close ${long ? "ostida" : "ustida"} ${r.stop_loss} (sweep ${r.sweep.extreme} buzilsa); ` +
      `limit 1 soatda to'lmasa yoki narx kirishga qaytmasdan TP1 ${r.tp1} ga yetsa — bekor`,
    reason: [...steps, `R:R ${levels.rr}`].join(" → "),
  };
}
