import type { Candle } from "../types/index";
import {
  calculateATR,
  findSwingHighs,
  findSwingLows,
  type SwingPoint,
} from "./indicators.service";

export type SmcSide = "long" | "short";

export interface KeyLevels {
  pdh: number;
  pdl: number;
  eqh: number | null;
  eql: number | null;
}

export interface LiquiditySweep {
  level: number;
  levelType: "pdh" | "pdl" | "eqh" | "eql";
  sweepLow: number;
  sweepHigh: number;
  index: number;
}

export interface StructureBreak {
  type: "bos" | "choch";
  level: number;
  index: number;
}

export interface FairValueGap {
  top: number;
  bottom: number;
  index: number;
}

export interface OrderBlock {
  top: number;
  bottom: number;
  index: number;
}

export interface SmcSetup {
  side: SmcSide;
  keyLevels: KeyLevels;
  sweep: LiquiditySweep | null;
  structure: StructureBreak | null;
  entryZone: FairValueGap | OrderBlock | null;
  entryType: "fvg" | "ob" | null;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
}

function tolerance(price: number, atr: number): number {
  return Math.max(price * 0.0015, atr * 0.15);
}

export function getPreviousDayLevels(dailyCandles: Candle[]): KeyLevels | null {
  if (dailyCandles.length < 3) return null;

  const prevDay = dailyCandles[dailyCandles.length - 2]!;
  const recent = dailyCandles.slice(-30);
  const atr = calculateATR(recent, 14);

  const swingHighs = findSwingHighs(recent, 2, 2);
  const swingLows = findSwingLows(recent, 2, 2);

  let eqh: number | null = null;
  let eql: number | null = null;

  for (let i = 0; i < swingHighs.length; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      const diff = Math.abs(swingHighs[i]!.price - swingHighs[j]!.price);
      if (diff <= tolerance(swingHighs[i]!.price, atr)) {
        eqh = (swingHighs[i]!.price + swingHighs[j]!.price) / 2;
        break;
      }
    }
    if (eqh) break;
  }

  for (let i = 0; i < swingLows.length; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      const diff = Math.abs(swingLows[i]!.price - swingLows[j]!.price);
      if (diff <= tolerance(swingLows[i]!.price, atr)) {
        eql = (swingLows[i]!.price + swingLows[j]!.price) / 2;
        break;
      }
    }
    if (eql) break;
  }

  return {
    pdh: prevDay.high,
    pdl: prevDay.low,
    eqh,
    eql,
  };
}

function detectSweepAtLevel(
  candles: Candle[],
  level: number,
  levelType: LiquiditySweep["levelType"],
  side: SmcSide,
  lookback: number = 48,
): LiquiditySweep | null {
  const recent = candles.slice(-lookback);

  for (let i = recent.length - 1; i >= 2; i--) {
    const candle = recent[i]!;

    if (side === "long") {
      if (candle.low < level && candle.close > level) {
        return {
          level,
          levelType,
          sweepLow: candle.low,
          sweepHigh: candle.high,
          index: candles.length - recent.length + i,
        };
      }
    } else {
      if (candle.high > level && candle.close < level) {
        return {
          level,
          levelType,
          sweepLow: candle.low,
          sweepHigh: candle.high,
          index: candles.length - recent.length + i,
        };
      }
    }
  }

  return null;
}

export function detectLiquiditySweep(
  candles: Candle[],
  levels: KeyLevels,
  side: SmcSide,
): LiquiditySweep | null {
  const targets: Array<{ level: number; type: LiquiditySweep["levelType"] }> =
    side === "long"
      ? [
          { level: levels.pdl, type: "pdl" },
          ...(levels.eql ? [{ level: levels.eql, type: "eql" as const }] : []),
        ]
      : [
          { level: levels.pdh, type: "pdh" },
          ...(levels.eqh ? [{ level: levels.eqh, type: "eqh" as const }] : []),
        ];

  for (const target of targets) {
    const sweep = detectSweepAtLevel(candles, target.level, target.type, side);
    if (sweep) return sweep;
  }

  return null;
}

function getRecentSwings(
  candles: Candle[],
  side: SmcSide,
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const recent = candles.slice(-80);
  const offset = candles.length - recent.length;
  const highs = findSwingHighs(recent, 2, 2).map((s) => ({
    index: s.index + offset,
    price: s.price,
  }));
  const lows = findSwingLows(recent, 2, 2).map((s) => ({
    index: s.index + offset,
    price: s.price,
  }));
  return { highs, lows };
}

export function detectStructureBreak(
  candles: Candle[],
  side: SmcSide,
  afterIndex: number = 0,
): StructureBreak | null {
  const { highs, lows } = getRecentSwings(candles, side);
  const price = candles[candles.length - 1]!.close;

  if (side === "long") {
    const relevantHighs = highs.filter((h) => h.index >= afterIndex);
    if (relevantHighs.length === 0) return null;

    const lastSwingHigh = relevantHighs[relevantHighs.length - 1]!;
    if (price > lastSwingHigh.price) {
      return { type: "bos", level: lastSwingHigh.price, index: lastSwingHigh.index };
    }

    if (relevantHighs.length >= 2) {
      const prev = relevantHighs[relevantHighs.length - 2]!;
      if (
        lastSwingHigh.price < prev.price &&
        price > lastSwingHigh.price
      ) {
        return { type: "choch", level: lastSwingHigh.price, index: lastSwingHigh.index };
      }
    }
  } else {
    const relevantLows = lows.filter((l) => l.index >= afterIndex);
    if (relevantLows.length === 0) return null;

    const lastSwingLow = relevantLows[relevantLows.length - 1]!;
    if (price < lastSwingLow.price) {
      return { type: "bos", level: lastSwingLow.price, index: lastSwingLow.index };
    }

    if (relevantLows.length >= 2) {
      const prev = relevantLows[relevantLows.length - 2]!;
      if (
        lastSwingLow.price > prev.price &&
        price < lastSwingLow.price
      ) {
        return { type: "choch", level: lastSwingLow.price, index: lastSwingLow.index };
      }
    }
  }

  return null;
}

export function findNearestFVG(
  candles: Candle[],
  side: SmcSide,
  afterIndex: number = 0,
): FairValueGap | null {
  let best: FairValueGap | null = null;

  for (let i = Math.max(2, afterIndex + 2); i < candles.length; i++) {
    const c1 = candles[i - 2]!;
    const c3 = candles[i]!;

    if (side === "long" && c1.high < c3.low) {
      const gap: FairValueGap = {
        bottom: c1.high,
        top: c3.low,
        index: i,
      };
      if (!best || gap.index > best.index) best = gap;
    } else if (side === "short" && c1.low > c3.high) {
      const gap: FairValueGap = {
        top: c1.low,
        bottom: c3.high,
        index: i,
      };
      if (!best || gap.index > best.index) best = gap;
    }
  }

  return best;
}

export function findNearestOrderBlock(
  candles: Candle[],
  side: SmcSide,
  afterIndex: number = 0,
): OrderBlock | null {
  const atr = calculateATR(candles.slice(-50), 14);
  let best: OrderBlock | null = null;

  for (let i = afterIndex + 1; i < candles.length - 1; i++) {
    const current = candles[i]!;
    const next = candles[i + 1]!;
    const move = Math.abs(next.close - current.close);

    if (move < atr * 1.2) continue;

    if (side === "long" && current.close < current.open && next.close > next.open) {
      const ob: OrderBlock = {
        top: current.high,
        bottom: current.low,
        index: i,
      };
      if (!best || ob.index > best.index) best = ob;
    } else if (
      side === "short" &&
      current.close > current.open &&
      next.close < next.open
    ) {
      const ob: OrderBlock = {
        top: current.high,
        bottom: current.low,
        index: i,
      };
      if (!best || ob.index > best.index) best = ob;
    }
  }

  return best;
}

export function computeStopLoss(
  candles: Candle[],
  side: SmcSide,
  sweep: LiquiditySweep | null,
): number {
  const { highs, lows } = getRecentSwings(candles, side);
  const atr = calculateATR(candles.slice(-50), 14);

  if (side === "long") {
    const swingLow = lows.length > 0 ? lows[lows.length - 1]!.price : null;
    const sweepLow = sweep?.sweepLow ?? null;
    const base = swingLow ?? sweepLow ?? candles[candles.length - 1]!.low;
    return base - atr * 0.1;
  }

  const swingHigh = highs.length > 0 ? highs[highs.length - 1]!.price : null;
  const sweepHigh = sweep?.sweepHigh ?? null;
  const base = swingHigh ?? sweepHigh ?? candles[candles.length - 1]!.high;
  return base + atr * 0.1;
}

export function computeTakeProfit(
  levels: KeyLevels,
  side: SmcSide,
  entry: number,
  stopLoss: number,
): number {
  const risk = Math.abs(entry - stopLoss);

  const liquidityTargets =
    side === "long"
      ? [levels.pdh, levels.eqh].filter((v): v is number => v !== null)
      : [levels.pdl, levels.eql].filter((v): v is number => v !== null);

  for (const target of liquidityTargets) {
    const reward = side === "long" ? target - entry : entry - target;
    if (reward >= risk * 2) return target;
  }

  return side === "long" ? entry + risk * 2.5 : entry - risk * 2.5;
}

export function buildSmcSetup(
  candles5m: Candle[],
  dailyCandles: Candle[],
  side: SmcSide,
): SmcSetup | null {
  const keyLevels = getPreviousDayLevels(dailyCandles);
  if (!keyLevels) return null;

  const sweep = detectLiquiditySweep(candles5m, keyLevels, side);
  const afterIndex = sweep?.index ?? 0;
  const structure = detectStructureBreak(candles5m, side, afterIndex);

  const fvg = findNearestFVG(candles5m, side, afterIndex);
  const ob = findNearestOrderBlock(candles5m, side, afterIndex);

  let entryZone: FairValueGap | OrderBlock | null = null;
  let entryType: "fvg" | "ob" | null = null;

  if (fvg && ob) {
    if (fvg.index >= ob.index) {
      entryZone = fvg;
      entryType = "fvg";
    } else {
      entryZone = ob;
      entryType = "ob";
    }
  } else if (fvg) {
    entryZone = fvg;
    entryType = "fvg";
  } else if (ob) {
    entryZone = ob;
    entryType = "ob";
  }

  const price = candles5m[candles5m.length - 1]!.close;
  const entry =
    entryZone && "top" in entryZone && "bottom" in entryZone
      ? (entryZone.top + entryZone.bottom) / 2
      : price;

  const stopLoss = computeStopLoss(candles5m, side, sweep);
  const takeProfit = computeTakeProfit(keyLevels, side, entry, stopLoss);
  const risk = Math.abs(entry - stopLoss);
  const reward = side === "long" ? takeProfit - entry : entry - takeProfit;
  const riskReward = risk > 0 ? reward / risk : 0;

  return {
    side,
    keyLevels,
    sweep,
    structure,
    entryZone,
    entryType,
    stopLoss,
    takeProfit,
    riskReward,
  };
}
