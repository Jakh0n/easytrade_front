import { FQ_SWING_CONFIG, type FqConfig } from "./engine";
import type { Candle, SignalStatus } from "../../types/index";

/** Pine: TP1 da yopiladigan qism (50%) va BE ofset (0.1R). */
const PARTIAL = 0.5;
const BE_OFFSET_R = 0.1;
/** Shuncha shamdan keyin ham yopilmagan signal "expired" (1H → 7 kun). */
export const SIGNAL_MAX_BARS = 168;

export interface SignalLevels {
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
}

export interface SignalOutcome {
  status: SignalStatus;
  resultR: number | null;
  closedAt: number | null;
  tp1At: number | null;
}

/**
 * Signal shamidan keyingi shamlarni Pine'dagi chiqish mantig'i bo'yicha o'ynatadi:
 * TP1 da 50% yopiladi va stop BE + 0.1R ga suriladi; qolgan qism TP2 yoki BE da.
 * Bitta shamda stop ham, TP ham tegsa — konservativ: stop birinchi deb olinadi.
 */
export function evaluateSignalOutcome(
  levels: SignalLevels,
  candlesAfter: Candle[],
  config: Pick<FqConfig, "tp1R" | "tp2R"> = FQ_SWING_CONFIG,
  maxBars: number = SIGNAL_MAX_BARS,
): SignalOutcome {
  const d = levels.side === "long" ? 1 : -1;
  const risk = Math.abs(levels.entry - levels.stopLoss);
  if (risk <= 0) return { status: "open", resultR: null, closedAt: null, tp1At: null };

  // R karralari darajalardan olinadi (Fib extension TP2 o'zgaruvchan bo'lishi mumkin).
  const tp1R = Math.abs(levels.tp1 - levels.entry) / risk || config.tp1R;
  const tp2R = Math.abs(levels.tp2 - levels.entry) / risk || config.tp2R;
  const beStop = levels.entry + d * risk * BE_OFFSET_R;
  const hitDown = (c: Candle, price: number) => (d === 1 ? c.low <= price : c.high >= price);
  const hitUp = (c: Candle, price: number) => (d === 1 ? c.high >= price : c.low <= price);

  let tp1At: number | null = null;
  const bars = candlesAfter.slice(0, maxBars);

  for (const candle of bars) {
    if (tp1At === null) {
      if (hitDown(candle, levels.stopLoss)) {
        return { status: "sl", resultR: -1, closedAt: candle.closeTime, tp1At };
      }
      if (hitUp(candle, levels.tp1)) {
        tp1At = candle.closeTime;
        if (hitUp(candle, levels.tp2)) {
          return {
            status: "tp2",
            resultR: PARTIAL * tp1R + (1 - PARTIAL) * tp2R,
            closedAt: candle.closeTime,
            tp1At,
          };
        }
      }
      continue;
    }

    if (hitDown(candle, beStop)) {
      return {
        status: "be",
        resultR: PARTIAL * tp1R + (1 - PARTIAL) * BE_OFFSET_R,
        closedAt: candle.closeTime,
        tp1At,
      };
    }
    if (hitUp(candle, levels.tp2)) {
      return {
        status: "tp2",
        resultR: PARTIAL * tp1R + (1 - PARTIAL) * tp2R,
        closedAt: candle.closeTime,
        tp1At,
      };
    }
  }

  if (bars.length >= maxBars) {
    const last = bars.at(-1)!;
    const openR = (d * (last.close - levels.entry)) / risk;
    const resultR =
      tp1At !== null ? PARTIAL * tp1R + (1 - PARTIAL) * openR : openR;
    return { status: "expired", resultR, closedAt: last.closeTime, tp1At };
  }

  return { status: tp1At !== null ? "tp1" : "open", resultR: null, closedAt: null, tp1At };
}
