import { calculateEMA } from "../indicators.service";
import {
  calculateADXSeries,
  calculateATRSeries,
  calculateRSISeries,
} from "../indicators.series";
import type { Candle } from "../../types/index";

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

export type FqHtfBias = "bullish" | "bearish" | null;
export type FqSetup = "pullback" | "breakout";

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
  longSig: boolean;
  shortSig: boolean;
  swingLo: number;
  swingHi: number;
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
    };
  }
  const closes = candles.map((c) => c.close);
  const dmi = calculateADXSeries(candles, config.adxLen);
  return {
    candles,
    emaFast: calculateEMA(closes, config.emaFastLen),
    emaMid: calculateEMA(closes, config.emaMidLen),
    emaSlow: calculateEMA(closes, config.emaSlowLen),
    rsi: calculateRSISeries(closes, config.rsiLen),
    atr: calculateATRSeries(candles, config.atrLen),
    volAvg: smaSeries(
      candles.map((c) => c.volume),
      20,
    ),
    adx: dmi.adx,
    diPlus: dmi.plusDi,
    diMinus: dmi.minusDi,
  };
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
    longSig: (pbLong || boLong) && adxOk && diLongOk && extOk,
    shortSig: (pbShort || boShort) && adxOk && diShortOk && extOk,
    swingLo,
    swingHi,
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
  const rawSl =
    d === 1 ? state.swingLo - atr * config.slBuffer : state.swingHi + atr * config.slBuffer;
  const risk = Math.max(Math.abs(close - rawSl), atr * config.minRiskAtr);
  return {
    side,
    entry: close,
    stopLoss: close - d * risk,
    tp1: close + d * risk * config.tp1R,
    tp2: close + d * risk * config.tp2R,
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
