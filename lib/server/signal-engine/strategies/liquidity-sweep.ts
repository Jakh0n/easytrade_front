/**
 * 5.4 Liquidity sweep (reversal). On 15m:
 *   1. Level: previous daily/weekly high/low, or equal highs/lows (≥ 2 1H swing touches)
 *   2. Sweep candle (second-to-last closed): wick pierces the level, body closes back inside
 *   3. Sweep candle volume > 1.5× average
 *   4. Confirmation (last closed candle) closes in the reversal direction
 * SL beyond the wick tip · TP1 mid-range · TP2 opposite liquidity.
 */
import type { Candle } from "../../types/index";
import { last, sma } from "../indicators";
import type { Direction, Signal, Strategy, StrategyInput } from "../types";
import { buildEntry, round, sign } from "./helpers";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Binance weeks start Monday 00:00 UTC; the Unix epoch was a Thursday. */
const WEEK_OFFSET = 4 * DAY_MS;

interface Level {
  price: number;
  side: "high" | "low";
  name: string;
  weekly: boolean;
}

function periodHighLow(candles: Candle[], from: number, to: number): { high: number; low: number } | null {
  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    if (c.openTime >= from && c.openTime < to) {
      high = Math.max(high, c.high);
      low = Math.min(low, c.low);
    }
  }
  return Number.isFinite(high) ? { high, low } : null;
}

export function liquidityLevels(input: StrategyInput): Level[] {
  const { data, ind, cfg } = input;
  const p = cfg.strategies.liquidity_sweep;
  const now = data.c15m.at(-1)?.closeTime ?? data.now;
  const levels: Level[] = [];

  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const pd = periodHighLow(data.c1h, dayStart - DAY_MS, dayStart);
  if (pd) levels.push({ price: pd.high, side: "high", name: "PDH", weekly: false }, { price: pd.low, side: "low", name: "PDL", weekly: false });

  const weekStart = Math.floor((now - WEEK_OFFSET) / WEEK_MS) * WEEK_MS + WEEK_OFFSET;
  const pw = periodHighLow(data.c4h, weekStart - WEEK_MS, weekStart);
  if (pw) levels.push({ price: pw.high, side: "high", name: "PWH", weekly: true }, { price: pw.low, side: "low", name: "PWL", weekly: true });

  // Equal highs / lows from 1H swings.
  const atr1h = last(ind.h1.atr);
  const minIndex = data.c1h.length - p.equalLookback1h;
  for (const [points, side] of [
    [ind.h1.swingHighs, "high"],
    [ind.h1.swingLows, "low"],
  ] as const) {
    const recent = points.filter((x) => x.index >= minIndex);
    for (let i = recent.length - 1; i >= 0; i--) {
      const base = recent[i]!;
      const touches = recent.filter((x) => Math.abs(x.price - base.price) <= p.equalTolAtr * atr1h);
      if (touches.length >= p.equalMinTouches) {
        const price = side === "high" ? Math.max(...touches.map((x) => x.price)) : Math.min(...touches.map((x) => x.price));
        levels.push({ price, side, name: side === "high" ? "Equal highs" : "Equal lows", weekly: false });
        break; // most recent cluster only
      }
    }
  }
  return levels;
}

function evaluate(symbol: string, input: StrategyInput): Signal | null {
  const { data, ind, cfg } = input;
  const p = cfg.strategies.liquidity_sweep;
  const c = data.c15m;
  const n = c.length;
  if (n < p.volAvgPeriod + 3) return null;
  const sweep = c[n - 2]!;
  const confirm = c[n - 1]!;

  // 3. Sweep volume (checked first: cheapest filter).
  const avgVol = sma(c.map((x) => x.volume), p.volAvgPeriod, n - 2);
  const volRatio = avgVol > 0 ? sweep.volume / avgVol : NaN;
  if (!(volRatio > p.volMult)) return null;

  const levels = liquidityLevels(input); // 1
  const atr15 = last(ind.m15.atr);

  // 2. Wick through, body back inside. Prefer weekly, then the deepest sweep.
  const candidates = levels
    .filter((l) =>
      l.side === "high"
        ? sweep.high > l.price && Math.max(sweep.open, sweep.close) < l.price
        : sweep.low < l.price && Math.min(sweep.open, sweep.close) > l.price,
    )
    .sort((a, b) => Number(b.weekly) - Number(a.weekly));
  const level = candidates[0];
  if (!level) return null;

  const d: Direction = level.side === "high" ? "short" : "long";
  const s = sign(d);

  // 4. Confirmation candle closes in the reversal direction.
  if (!(s * (confirm.close - confirm.open) > 0 && s * (confirm.close - sweep.close) > 0)) return null;

  const wickTip = d === "short" ? sweep.high : sweep.low;
  const sl = wickTip - s * p.slAtr * atr15; // just beyond the tip
  const zoneFar = confirm.close - s * p.entryZoneAtr * atr15;
  // Do not let the zone extend past the swept level (that is where the trade is wrong).
  const zone: [number, number] =
    d === "long" ? [Math.max(zoneFar, level.price), confirm.close] : [confirm.close, Math.min(zoneFar, level.price)];

  // Opposite liquidity: the nearest level of the other side in the trade direction.
  const mid0 = (zone[0] + zone[1]) / 2;
  const oppositeSide = d === "long" ? "high" : "low";
  const opposite = levels
    .filter((l) => l.side === oppositeSide && s * (l.price - mid0) > 0)
    .sort((a, b) => s * (a.price - b.price))[0];
  if (!opposite) return null;
  const tp2 = opposite.price;
  const tp1 = (level.price + opposite.price) / 2;

  return buildEntry({
    input,
    strategy: "liquidity_sweep",
    direction: d,
    zone,
    stopLoss: sl,
    tp1,
    tp2,
    confidence: p.baseConfidence + (level.weekly ? p.weeklyBonus : 0) + Math.min(10, (volRatio - p.volMult) * 4),
    invalidation: { timeframe: "15m", level: wickTip, description: "15m close beyond the sweep wick" },
    reasons: [
      `${level.name} swept (${volRatio.toFixed(1)}x volume)`,
      `Reclaim + ${d === "long" ? "bullish" : "bearish"} confirmation`,
      `Target: ${opposite.name}`,
    ],
    factors: {
      ls_level: level.name,
      ls_weekly: level.weekly,
      ls_vol_ratio: round(volRatio, 2),
      ls_wick_atr: round(Math.abs(wickTip - level.price) / atr15, 3),
    },
  });
}

export const liquiditySweep: Strategy = { name: "liquidity_sweep", evaluate };
