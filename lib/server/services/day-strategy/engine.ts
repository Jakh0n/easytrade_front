import { calculateEMA } from "../indicators.service";
import { calculateATRSeries } from "../indicators.series";
import type { Candle } from "../../types/index";

/**
 * Day trade rejimi — Supertrend(10, 3) 15M + 1H EMA 50/200 trend filtri.
 *
 * Backtest (2026-07..11, 10 ta likvid futures juftlik, 0.14% round-trip xarajat):
 * 5m va 15m dagi 9 ta g'oyadan faqat shu biri xarajatdan keyin musbat qoldi
 * (+0.067R/savdo, PF 1.12, ikkala yarimda ham musbat). Edge yupqa — risk kichik bo'lsin.
 *
 * Kirish: Supertrend yo'nalishi 1H trend tomonga o'zgargan sham yopilishida.
 * Stop: o'sha shamdagi Supertrend chizig'i. Chiqish: Supertrend teskari o'zgarganda.
 * Qat'iy TP yo'q — backtestda TP=3R natijani yomonlashtirdi.
 */
export const DAY_CONFIG = {
  interval: "15m",
  htfInterval: "1h",
  stLen: 10,
  stMult: 3,
  htfFastLen: 50,
  htfSlowLen: 200,
  /** Shuncha shamdan keyin ham yopilmagan savdo "expired" (15M → 3 kun). */
  maxBars: 288,
  riskPct: 0.5,
} as const;

export const DAY_BAR_MS = 15 * 60_000;

export type DayBias = "bullish" | "bearish" | null;

export interface SupertrendSeries {
  /** 1 = yuqoriga, -1 = pastga, 0 = hali hisoblanmagan. */
  dir: number[];
  /** Faol chiziq: yuqori trendda pastki band, past trendda yuqori band. */
  line: number[];
}

/** TradingView `ta.supertrend` bilan bir xil mantiq (hl2 ± mult × ATR, Wilder ATR). */
export function computeSupertrend(
  candles: Candle[],
  len: number = DAY_CONFIG.stLen,
  mult: number = DAY_CONFIG.stMult,
): SupertrendSeries {
  const n = candles.length;
  const dir = new Array<number>(n).fill(0);
  const line = new Array<number>(n).fill(NaN);
  if (n === 0) return { dir, line };

  const atr = calculateATRSeries(candles, len);
  let upper = NaN;
  let lower = NaN;
  let trend = 1;

  for (let i = 0; i < n; i++) {
    const a = atr[i]!;
    if (!Number.isFinite(a)) continue;
    const c = candles[i]!;
    const prevClose = i > 0 ? candles[i - 1]!.close : c.close;
    const mid = (c.high + c.low) / 2;
    const basicLower = mid - mult * a;
    const basicUpper = mid + mult * a;

    lower = !Number.isFinite(lower) || prevClose < lower ? basicLower : Math.max(basicLower, lower);
    upper = !Number.isFinite(upper) || prevClose > upper ? basicUpper : Math.min(basicUpper, upper);

    if (trend === -1 && c.close > upper) trend = 1;
    else if (trend === 1 && c.close < lower) trend = -1;

    dir[i] = trend;
    line[i] = trend === 1 ? lower : upper;
  }

  return { dir, line };
}

/** 1H filtri: close > EMA200 va EMA50 > EMA200 → bullish (aksincha bearish). */
export function computeDayBias(htfCandles: Candle[]): DayBias {
  if (htfCandles.length < DAY_CONFIG.htfSlowLen) return null;
  const closes = htfCandles.map((c) => c.close);
  const slow = calculateEMA(closes, DAY_CONFIG.htfSlowLen).at(-1)!;
  const fast = calculateEMA(closes, DAY_CONFIG.htfFastLen).at(-1)!;
  const close = closes.at(-1)!;
  if (!Number.isFinite(slow) || !Number.isFinite(fast)) return null;
  if (close > slow && fast > slow) return "bullish";
  if (close < slow && fast < slow) return "bearish";
  return null;
}

export interface DayOutcome {
  status: "open" | "sl" | "exit" | "expired";
  resultR: number | null;
  closedAt: number | null;
}

/**
 * Signal shamidan keyingi yopilgan shamlarni o'ynatadi.
 * `candles` signal shamini va undan oldingi isitish shamlarini o'z ichiga olishi kerak
 * (Supertrend qayta hisoblanadi). Stop va flip bitta shamda bo'lsa — stop birinchi.
 */
export function evaluateDayOutcome(
  signal: { side: "long" | "short"; entry: number; stopLoss: number; signalTime: number },
  candles: Candle[],
  maxBars: number = DAY_CONFIG.maxBars,
): DayOutcome {
  const d = signal.side === "long" ? 1 : -1;
  const risk = Math.abs(signal.entry - signal.stopLoss);
  const start = candles.findIndex((c) => c.openTime === signal.signalTime);
  if (risk <= 0 || start < 0) return { status: "open", resultR: null, closedAt: null };

  const { dir } = computeSupertrend(candles);
  const rOf = (price: number) => (d * (price - signal.entry)) / risk;
  const last = Math.min(candles.length - 1, start + maxBars);

  for (let j = start + 1; j <= last; j++) {
    const c = candles[j]!;
    const stopped = d === 1 ? c.low <= signal.stopLoss : c.high >= signal.stopLoss;
    if (stopped) {
      // Gap bo'lsa ochilish narxida chiqiladi.
      const fill = d === 1 ? Math.min(c.open, signal.stopLoss) : Math.max(c.open, signal.stopLoss);
      return { status: "sl", resultR: rOf(fill), closedAt: c.closeTime };
    }
    if (dir[j] !== 0 && dir[j] !== d) {
      return { status: "exit", resultR: rOf(c.close), closedAt: c.closeTime };
    }
  }

  if (last - start >= maxBars) {
    const c = candles[last]!;
    return { status: "expired", resultR: rOf(c.close), closedAt: c.closeTime };
  }
  return { status: "open", resultR: null, closedAt: null };
}
