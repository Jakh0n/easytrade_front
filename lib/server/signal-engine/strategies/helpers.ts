import type { Candle } from "../../types/index";
import type { StrategyName } from "../config";
import type { SwingPoint } from "../indicators";
import type { Direction, FactorValue, Invalidation, Signal, StrategyInput } from "../types";

export const sign = (d: Direction): 1 | -1 => (d === "long" ? 1 : -1);

export function isBullishEngulfing(prev: Candle, cur: Candle): boolean {
  return prev.close < prev.open && cur.close > cur.open && cur.close >= prev.open && cur.open <= prev.close;
}

export function isBearishEngulfing(prev: Candle, cur: Candle): boolean {
  return prev.close > prev.open && cur.close < cur.open && cur.close <= prev.open && cur.open >= prev.close;
}

/**
 * Market-structure break on the LAST closed candle: it closes beyond the most recent
 * confirmed swing (high for long, low for short) while the previous candle had not.
 */
export function freshStructureBreak(
  candles: Candle[],
  highs: SwingPoint[],
  lows: SwingPoint[],
  direction: Direction,
  maxAge: number,
): SwingPoint | null {
  const n = candles.length;
  if (n < 2) return null;
  const swing = (direction === "long" ? highs : lows).at(-1);
  if (!swing || n - 1 - swing.index > maxAge) return null;
  const cur = candles[n - 1]!;
  const prev = candles[n - 2]!;
  if (direction === "long") return cur.close > swing.price && prev.close <= swing.price ? swing : null;
  return cur.close < swing.price && prev.close >= swing.price ? swing : null;
}

/** Limit zone from a trigger close: long → [close − z·ATR, close], short → [close, close + z·ATR]. */
export function zoneFromClose(close: number, atr: number, mult: number, direction: Direction): [number, number] {
  const width = atr * mult;
  return direction === "long" ? [close - width, close] : [close, close + width];
}

export function entryMid(low: number, high: number): number {
  return (low + high) / 2;
}

export function round(x: number, digits = 4): number {
  return Number.isFinite(x) ? Number(x.toFixed(digits)) : x;
}

interface BuildArgs {
  input: StrategyInput;
  strategy: StrategyName;
  direction: Direction;
  zone: [number, number];
  stopLoss: number;
  tp1: number;
  tp2: number;
  confidence: number;
  invalidation?: Invalidation | null;
  reasons: string[];
  factors: Record<string, FactorValue>;
}

/** Common ENTRY builder: checks level ordering (SL < zone < TP1 < TP2 for long) and sets expiry. */
export function buildEntry(a: BuildArgs): Signal | null {
  const [low, high] = a.zone[0] <= a.zone[1] ? a.zone : [a.zone[1], a.zone[0]];
  const s = sign(a.direction);
  const mid = entryMid(low, high);
  const ordered =
    s === 1
      ? a.stopLoss < low && a.tp1 > high && a.tp2 > a.tp1
      : a.stopLoss > high && a.tp1 < low && a.tp2 < a.tp1;
  if (!ordered || !(Math.abs(mid - a.stopLoss) > 0)) return null;
  const trigger = a.input.data.c15m.at(-1)!;
  return {
    symbol: a.input.data.symbol,
    direction: a.direction,
    strategy: a.strategy,
    kind: "entry",
    entryZoneLow: low,
    entryZoneHigh: high,
    stopLoss: a.stopLoss,
    tp1: a.tp1,
    tp2: a.tp2,
    confidence: Math.max(0, Math.min(100, Math.round(a.confidence))),
    triggerTime: trigger.closeTime,
    expiresAt: trigger.closeTime + a.input.cfg.antiLate.expiryMin * 60_000,
    invalidation: a.invalidation ?? null,
    reasons: a.reasons,
    factors: a.factors,
  };
}

/** Index of the first OI point at/after a time — helper for "OI change over N hours". */
export function hoursMs(h: number): number {
  return h * 3_600_000;
}
