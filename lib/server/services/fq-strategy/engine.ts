import { calculateEMA } from "../indicators.service";
import {
  calculateADXSeries,
  calculateATRSeries,
  calculateRSISeries,
} from "../indicators.series";
import type { Candle } from "../../types/index";
import {
  DEFAULT_STRUCTURE_CONFIG,
  computeStructure,
  retracement,
  type Leg,
  type StructureBar,
  type Sweep,
  type Zone,
} from "./structure";

/**
 * FQ Strategy v3 (Pine Script) port — swing rejimi.
 *
 * Trend: EMA 20/50/200 + katta timeframe EMA 200 filtri.
 * Trigger: pullback (EMA 20 ga qaytish) yoki breakout (diapazon sinishi + hajm).
 * Filtrlar: ADX, DI yo'nalishi, EMA 20 dan cho'zilish (ATR).
 * Chiqish: swing low/high + ATR bufer stop, TP1 / TP2 R karralari.
 */
export interface FqConfig {
  emaFastLen: number;
  emaMidLen: number;
  emaSlowLen: number;
  usePullback: boolean;
  useBreakout: boolean;
  brkLen: number;
  volMult: number;
  rsiLen: number;
  rsiOB: number;
  rsiOS: number;
  useAdx: boolean;
  adxLen: number;
  adxMin: number;
  useDi: boolean;
  useExt: boolean;
  extMaxAtr: number;
  atrLen: number;
  swingLen: number;
  slBuffer: number;
  minRiskAtr: number;
  maxRiskAtr: number;
  tp1R: number;
  tp2R: number;
  riskPct: number;
  // ── Konfluens (SMC / Fibonacci) — hammasi ixtiyoriy, default o'chiq ──
  /** Pullback shami impulsning [fibMin, fibMax] retracement zonasiga tegsin. */
  useFibZone?: boolean;
  fibMin?: number;
  fibMax?: number;
  /** Impuls kamida shuncha ATR bo'lsin (aks holda Fib hisoblanmaydi). */
  minLegAtr?: number;
  /** Pullback mitigatsiya qilinmagan order block'ga tegsin. */
  useOrderBlock?: boolean;
  /** OB displacement FVG qoldirgan bo'lishi shart. */
  obRequireFvg?: boolean;
  /** Yangi trigger: trend tomonga likvidlik sweep + qaytish. */
  useSweepTrigger?: boolean;
  /** Oxirgi BOS savdo yo'nalishida bo'lsin. */
  useStructure?: boolean;
  /** "swing" — Pine (10 shamlik swing); "structure" — OB / sweep / impuls boshi ortida. */
  stopMode?: "swing" | "structure";
  /** TP2: qat'iy R yoki impulsning Fib extension'i (1.272 / 1.618). */
  exitMode?: "fixed" | "fib1272" | "fib1618";
  pivotLeft?: number;
  pivotRight?: number;
}

export const FQ_SWING_CONFIG: FqConfig = {
  emaFastLen: 20,
  emaMidLen: 50,
  emaSlowLen: 200,
  usePullback: true,
  useBreakout: true,
  brkLen: 20,
  volMult: 1.5,
  rsiLen: 14,
  rsiOB: 70,
  rsiOS: 30,
  useAdx: true,
  adxLen: 14,
  adxMin: 20,
  useDi: true,
  useExt: true,
  extMaxAtr: 2.0,
  atrLen: 14,
  swingLen: 10,
  slBuffer: 0.3,
  minRiskAtr: 0.8,
  maxRiskAtr: 3.0,
  tp1R: 1.0,
  tp2R: 2.5,
  riskPct: 1.0,
};

/**
 * Swing 4H: FQ v3 qoidalari 4H shamlarda (trend 1D EMA200), pullback faqat impulsning
 * Fib 0.5–0.786 zonasida. Backtest (20 likvid coin, 3 yil, 0.14% round-trip): sinab ko'rilgan
 * variantlar ichida faqat shu biri ikkala davrda ham musbat qoldi (train +0.026R, test +0.031R,
 * PF ≈ 1.05) — edge juda yupqa.
 */
export const FQ_4H_CONFIG: FqConfig = { ...FQ_SWING_CONFIG, useFibZone: true };

/**
 * Day 15M: Pine'dagi "⚡ Day trading rejimi" (7-bo'lim) sozlamalari — 15M shamlar,
 * katta TF 1H EMA200, qattiqroq ADX/cho'zilish filtri, qisqaroq swing stop va 2R TP2.
 */
export const FQ_15M_CONFIG: FqConfig = {
  ...FQ_SWING_CONFIG,
  adxMin: 22,
  extMaxAtr: 1.5,
  swingLen: 8,
  minRiskAtr: 1.0,
  maxRiskAtr: 2.5,
  tp1R: 1.0,
  tp2R: 2.0,
  riskPct: 0.75,
};

export type FqHtfBias = "bullish" | "bearish" | null;
export type FqSetup = "pullback" | "breakout" | "sweep";

export interface FqBarState {
  index: number;
  close: number;
  emaFast: number;
  emaMid: number;
  emaSlow: number;
  rsi: number;
  atr: number;
  adx: number;
  diPlus: number;
  diMinus: number;
  upTrend: boolean;
  dnTrend: boolean;
  adxOk: boolean;
  diLongOk: boolean;
  diShortOk: boolean;
  extOk: boolean;
  pbLong: boolean;
  pbShort: boolean;
  boLong: boolean;
  boShort: boolean;
  swLong: boolean;
  swShort: boolean;
  longSig: boolean;
  shortSig: boolean;
  swingLo: number;
  swingHi: number;
  /** Struktura konteksti (filtrlar o'chiq bo'lsa ham hisoblanadi — xabar/grafik uchun). */
  structure: StructureBar | null;
  /** Long/short uchun shamning impulsdagi retracement darajasi (NaN — impuls yo'q). */
  fibLong: number;
  fibShort: number;
  /** Yo'nalish bo'yicha konfluenslar: "Fib 0.62", "OB", "OB+FVG", "Sweep", "BOS". */
  confluencesLong: string[];
  confluencesShort: string[];
}

export interface FqLevels {
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  risk: number;
  riskOk: boolean;
}

export interface FqSeries {
  candles: Candle[];
  emaFast: number[];
  emaMid: number[];
  emaSlow: number[];
  rsi: number[];
  atr: number[];
  volAvg: number[];
  adx: number[];
  diPlus: number[];
  diMinus: number[];
  structure: StructureBar[];
}

function smaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function computeFqSeries(
  candles: Candle[],
  config: FqConfig = FQ_SWING_CONFIG,
): FqSeries {
  if (candles.length === 0) {
    return {
      candles,
      emaFast: [],
      emaMid: [],
      emaSlow: [],
      rsi: [],
      atr: [],
      volAvg: [],
      adx: [],
      diPlus: [],
      diMinus: [],
      structure: [],
    };
  }
  const closes = candles.map((c) => c.close);
  const dmi = calculateADXSeries(candles, config.adxLen);
  const atr = calculateATRSeries(candles, config.atrLen);
  return {
    candles,
    emaFast: calculateEMA(closes, config.emaFastLen),
    emaMid: calculateEMA(closes, config.emaMidLen),
    emaSlow: calculateEMA(closes, config.emaSlowLen),
    rsi: calculateRSISeries(closes, config.rsiLen),
    atr,
    volAvg: smaSeries(
      candles.map((c) => c.volume),
      20,
    ),
    adx: dmi.adx,
    diPlus: dmi.plusDi,
    diMinus: dmi.minusDi,
    structure: computeStructure(candles, atr, {
      ...DEFAULT_STRUCTURE_CONFIG,
      pivotLeft: config.pivotLeft ?? DEFAULT_STRUCTURE_CONFIG.pivotLeft,
      pivotRight: config.pivotRight ?? DEFAULT_STRUCTURE_CONFIG.pivotRight,
    }),
  };
}

function legOk(leg: Leg | null, atr: number, config: FqConfig): leg is Leg {
  return leg !== null && leg.high - leg.low >= (config.minLegAtr ?? 2) * atr;
}

function zoneOk(zone: Zone | null, config: FqConfig): zone is Zone {
  return zone !== null && (!config.obRequireFvg || zone.fvg);
}

function confluences(fib: number, zone: Zone | null, sweep: Sweep | null, bos: boolean, config: FqConfig): string[] {
  const list: string[] = [];
  if (fib >= (config.fibMin ?? 0.5) && fib <= (config.fibMax ?? 0.786)) list.push(`Fib ${fib.toFixed(2)}`);
  if (zone) list.push(zone.fvg ? "OB+FVG" : "OB");
  if (sweep) list.push("Sweep");
  if (bos) list.push("BOS");
  return list;
}

function highest(candles: Candle[], from: number, to: number): number {
  let value = -Infinity;
  for (let i = Math.max(0, from); i <= to; i++) value = Math.max(value, candles[i]!.high);
  return value;
}

function lowest(candles: Candle[], from: number, to: number): number {
  let value = Infinity;
  for (let i = Math.max(0, from); i <= to; i++) value = Math.min(value, candles[i]!.low);
  return value;
}

/** Bitta sham uchun barcha shartlar — Pine skriptdagi bilan bir xil mantiq. */
export function evaluateFqBar(
  series: FqSeries,
  index: number,
  htfBias: FqHtfBias,
  config: FqConfig = FQ_SWING_CONFIG,
  useHtf: boolean = true,
): FqBarState | null {
  const { candles } = series;
  const bar = candles[index];
  if (!bar || index < config.brkLen) return null;

  const emaFast = series.emaFast[index]!;
  const emaMid = series.emaMid[index]!;
  const emaSlow = series.emaSlow[index]!;
  const rsi = series.rsi[index]!;
  const atr = series.atr[index]!;
  const adx = series.adx[index]!;
  const diPlus = series.diPlus[index]!;
  const diMinus = series.diMinus[index]!;
  const volAvg = series.volAvg[index]!;

  const values = [emaFast, emaMid, emaSlow, rsi, atr, adx, diPlus, diMinus, volAvg];
  if (values.some((v) => !Number.isFinite(v))) return null;

  const { close, open, high, low, volume } = bar;

  const htfUp = !useHtf || htfBias === "bullish";
  const htfDn = !useHtf || htfBias === "bearish";

  const upTrend = close > emaSlow && emaMid > emaSlow && htfUp;
  const dnTrend = close < emaSlow && emaMid < emaSlow && htfDn;

  const adxOk = !config.useAdx || adx >= config.adxMin;
  const diCheck = config.useAdx && config.useDi;
  const diLongOk = !diCheck || diPlus > diMinus;
  const diShortOk = !diCheck || diMinus > diPlus;
  const extOk = !config.useExt || Math.abs(close - emaFast) <= config.extMaxAtr * atr;

  const pbLong =
    config.usePullback &&
    upTrend &&
    low <= emaFast &&
    close > emaFast &&
    close > open &&
    close > emaMid &&
    rsi > 40 &&
    rsi < config.rsiOB;
  const pbShort =
    config.usePullback &&
    dnTrend &&
    high >= emaFast &&
    close < emaFast &&
    close < open &&
    close < emaMid &&
    rsi < 60 &&
    rsi > config.rsiOS;

  const hh = highest(candles, index - config.brkLen, index - 1);
  const ll = lowest(candles, index - config.brkLen, index - 1);
  const volOk = volume > volAvg * config.volMult;
  const boLong = config.useBreakout && upTrend && close > hh && volOk && rsi < 80;
  const boShort = config.useBreakout && dnTrend && close < ll && volOk && rsi > 20;

  const swingLo = lowest(candles, index - config.swingLen + 1, index);
  const swingHi = highest(candles, index - config.swingLen + 1, index);

  const st = series.structure[index] ?? null;
  const fibLong = st && legOk(st.legLong, atr, config) ? retracement(st.legLong, low, "long") : NaN;
  const fibShort = st && legOk(st.legShort, atr, config) ? retracement(st.legShort, high, "short") : NaN;
  const fibMin = config.fibMin ?? 0.5;
  const fibMax = config.fibMax ?? 0.786;
  const fibLongOk = fibLong >= fibMin && fibLong <= fibMax;
  const fibShortOk = fibShort >= fibMin && fibShort <= fibMax;
  const obLongOk = zoneOk(st?.obLong ?? null, config);
  const obShortOk = zoneOk(st?.obShort ?? null, config);
  const structLong = st?.bias === "bull";
  const structShort = st?.bias === "bear";

  const pbLongF = pbLong && (!config.useFibZone || fibLongOk) && (!config.useOrderBlock || obLongOk);
  const pbShortF = pbShort && (!config.useFibZone || fibShortOk) && (!config.useOrderBlock || obShortOk);
  const swLong = !!config.useSweepTrigger && upTrend && st?.sweepLong != null && close > open && rsi < config.rsiOB;
  const swShort = !!config.useSweepTrigger && dnTrend && st?.sweepShort != null && close < open && rsi > config.rsiOS;
  const structOkLong = !config.useStructure || structLong;
  const structOkShort = !config.useStructure || structShort;

  return {
    index,
    close,
    emaFast,
    emaMid,
    emaSlow,
    rsi,
    atr,
    adx,
    diPlus,
    diMinus,
    upTrend,
    dnTrend,
    adxOk,
    diLongOk,
    diShortOk,
    extOk,
    pbLong,
    pbShort,
    boLong,
    boShort,
    swLong,
    swShort,
    longSig: (pbLongF || boLong || swLong) && adxOk && diLongOk && extOk && structOkLong,
    shortSig: (pbShortF || boShort || swShort) && adxOk && diShortOk && extOk && structOkShort,
    swingLo,
    swingHi,
    structure: st,
    fibLong,
    fibShort,
    confluencesLong: confluences(fibLong, obLongOk ? st!.obLong : null, st?.sweepLong ?? null, structLong, config),
    confluencesShort: confluences(fibShort, obShortOk ? st!.obShort : null, st?.sweepShort ?? null, structShort, config),
  };
}

/** Kirish, stop va TP darajalari (Pine: "Kirish" bo'limi). */
export function computeFqLevels(
  state: FqBarState,
  side: "long" | "short",
  config: FqConfig = FQ_SWING_CONFIG,
): FqLevels {
  const d = side === "long" ? 1 : -1;
  const { close, atr } = state;
  const long = d === 1;
  const st = state.structure;

  // Invalidatsiya nuqtasi: Pine'da 10 shamlik swing; "structure" rejimida — OB, sweep yoki impuls boshi.
  let anchor = long ? state.swingLo : state.swingHi;
  if (config.stopMode === "structure" && st) {
    const zone = long ? st.obLong : st.obShort;
    const sweep = long ? st.sweepLong : st.sweepShort;
    const leg = long ? st.legLong : st.legShort;
    const candidates = [
      zone ? (long ? zone.bottom : zone.top) : NaN,
      sweep ? sweep.extreme : NaN,
      // Fib zonasidagi pullback: impuls boshi ortida (faqat stopni juda uzoqlashtirmasa).
      leg && Number.isFinite(long ? state.fibLong : state.fibShort) ? (long ? leg.low : leg.high) : NaN,
    ].filter((v) => Number.isFinite(v) && (long ? v < close : v > close));
    if (candidates.length) anchor = long ? Math.max(...candidates) : Math.min(...candidates);
  }
  const rawSl = long ? anchor - atr * config.slBuffer : anchor + atr * config.slBuffer;
  const risk = Math.max(Math.abs(close - rawSl), atr * config.minRiskAtr);

  let tp2 = close + d * risk * config.tp2R;
  const leg = long ? st?.legLong : st?.legShort;
  if (config.exitMode && config.exitMode !== "fixed" && leg && leg.high > leg.low) {
    const ext = config.exitMode === "fib1272" ? 0.272 : 0.618;
    const size = leg.high - leg.low;
    const target = long ? leg.high + size * ext : leg.low - size * ext;
    // Pastki chegara 1.5R, yuqori 5R — Fib target juda yaqin/uzoq bo'lsa.
    const r = (d * (target - close)) / risk;
    tp2 = close + d * risk * Math.min(5, Math.max(1.5, Number.isFinite(r) ? r : config.tp2R));
  }

  return {
    side,
    entry: close,
    stopLoss: close - d * risk,
    tp1: close + d * risk * config.tp1R,
    tp2,
    risk,
    riskOk: risk <= atr * config.maxRiskAtr,
  };
}

/** Katta timeframe yo'nalishi: oxirgi yopilgan HTF sham close vs EMA. */
export function computeHtfBias(htfCandles: Candle[], emaLen: number = 200): FqHtfBias {
  if (htfCandles.length < emaLen) return null;
  const closes = htfCandles.map((c) => c.close);
  const ema = calculateEMA(closes, emaLen);
  const lastClose = closes.at(-1)!;
  const lastEma = ema.at(-1)!;
  if (!Number.isFinite(lastEma)) return null;
  if (lastClose > lastEma) return "bullish";
  if (lastClose < lastEma) return "bearish";
  return null;
}
