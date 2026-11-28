/**
 * 5.1 Trend Pullback — core AND conditions (long; short is the mirror):
 *   1. 4H context: EMA50 > EMA200 and ADX > adxMin
 *   2. 1H zone: price touched the EMA20–EMA50 band OR the Fib 0.382–0.618 band of the last impulse
 *   3. Not invalidated: last 1H close still above EMA50
 *   4. 15m trigger: bullish engulfing OR fresh break of the last lower-high
 * SL below zone − 0.5 ATR(1H) · TP1 previous swing high · TP2 2R.
 */
import { last } from "../indicators";
import type { Direction, Signal, Strategy, StrategyInput } from "../types";
import { buildEntry, entryMid, freshStructureBreak, isBearishEngulfing, isBullishEngulfing, round, sign, zoneFromClose } from "./helpers";

function contextDirection(input: StrategyInput): Direction | null {
  const { h4 } = input.ind;
  const p = input.cfg.strategies.trend_pullback;
  const adx = last(h4.adx);
  if (!(adx > p.adxMin)) return null;
  const fast = last(h4.emaFast);
  const slow = last(h4.emaSlow);
  if (fast > slow) return "long";
  if (fast < slow) return "short";
  return null;
}

interface ZoneHit {
  type: "ema" | "fib";
  /** Far edge of the zone (bottom for long, top for short) — the SL anchor. */
  farEdge: number;
}

function findZone(input: StrategyInput, d: Direction): ZoneHit | null {
  const { c1h } = input.data;
  const { h1 } = input.ind;
  const p = input.cfg.strategies.trend_pullback;
  const n = c1h.length;
  const s = sign(d);

  // EMA band touch within the lookback.
  for (let i = n - 1; i >= Math.max(0, n - p.zoneLookback1h); i--) {
    const fast = h1.emaBandFast[i]!;
    const slow = h1.emaBandSlow[i]!;
    if (!Number.isFinite(fast) || !Number.isFinite(slow)) continue;
    const top = Math.max(fast, slow);
    const bottom = Math.min(fast, slow);
    const c = c1h[i]!;
    const touched = s === 1 ? c.low <= top : c.high >= bottom;
    if (touched) return { type: "ema", farEdge: s === 1 ? bottom : top };
  }

  // Fib band of the last impulse: long = swing low → later swing high.
  const highs = h1.swingHighs;
  const lows = h1.swingLows;
  const end = s === 1 ? highs.at(-1) : lows.at(-1);
  if (!end) return null;
  const start = (s === 1 ? lows : highs).filter((x) => x.index < end.index).at(-1);
  if (!start) return null;
  const range = Math.abs(end.price - start.price);
  if (!(range > 0)) return null;
  const near = end.price - s * range * p.fibLow;
  const far = end.price - s * range * p.fibHigh;
  for (let i = Math.max(end.index + 1, n - p.zoneLookback1h); i < n; i++) {
    const c = c1h[i]!;
    const touched = s === 1 ? c.low <= near && c.close >= far : c.high >= near && c.close <= far;
    if (touched) return { type: "fib", farEdge: far };
  }
  return null;
}

function evaluate(symbol: string, input: StrategyInput): Signal | null {
  const { data, ind, cfg } = input;
  const p = cfg.strategies.trend_pullback;
  const d = contextDirection(input); // 1
  if (!d) return null;
  const s = sign(d);

  const zone = findZone(input, d); // 2
  if (!zone) return null;

  const last1h = data.c1h.at(-1);
  const ema50_1h = last(ind.h1.emaBandSlow);
  if (!last1h || !(s * (last1h.close - ema50_1h) > 0)) return null; // 3

  const c = data.c15m;
  const n = c.length;
  if (n < 3) return null;
  const engulf = s === 1 ? isBullishEngulfing(c[n - 2]!, c[n - 1]!) : isBearishEngulfing(c[n - 2]!, c[n - 1]!);
  // "Lower-high" (long) = the last swing high is below the one before it — a pullback structure.
  const swings = s === 1 ? ind.m15.swingHighs : ind.m15.swingLows;
  const lowerHigh = swings.length >= 2 && s * (swings.at(-1)!.price - swings.at(-2)!.price) < 0;
  const brk = lowerHigh
    ? freshStructureBreak(c, ind.m15.swingHighs, ind.m15.swingLows, d, p.triggerSwingMaxAge)
    : null;
  if (!engulf && !brk) return null; // 4

  const atr15 = last(ind.m15.atr);
  const atr1h = last(ind.h1.atr);
  const trigger = c[n - 1]!;
  const zoneRange = zoneFromClose(trigger.close, atr15, cfg.entryZoneAtr, d);
  const mid = entryMid(zoneRange[0], zoneRange[1]);
  const stopLoss = zone.farEdge - s * p.slAtr * atr1h;
  const risk = s * (mid - stopLoss);
  if (!(risk > 0)) return null;
  const tp2 = mid + s * p.tp2R * risk;
  const swingTarget = (s === 1 ? ind.h1.swingHighs : ind.h1.swingLows)
    .map((x) => x.price)
    .filter((price) => s * (price - (mid + s * 0.5 * risk)) > 0 && s * (tp2 - price) > 0)
    .sort((a, b) => s * (a - b))[0];
  const tp1 = swingTarget ?? mid + s * p.tp1FallbackR * risk;

  const adx = last(ind.h4.adx);
  return buildEntry({
    input,
    strategy: "trend_pullback",
    direction: d,
    zone: zoneRange,
    stopLoss,
    tp1,
    tp2,
    confidence: p.baseConfidence + Math.min(10, (adx - p.adxMin) / 2) + (engulf && brk ? 5 : 0),
    invalidation: {
      timeframe: "1h",
      level: ema50_1h,
      description: `1H close ${s === 1 ? "below" : "above"} EMA${p.emaBandSlow}`,
    },
    reasons: [
      `4H trend ${d === "long" ? "up" : "down"} (ADX ${adx.toFixed(0)})`,
      zone.type === "ema" ? `1H pullback into EMA${p.emaBandFast}–${p.emaBandSlow}` : `1H pullback into Fib ${p.fibLow}–${p.fibHigh}`,
      engulf ? `15m ${d === "long" ? "bullish" : "bearish"} engulfing` : `15m break of last ${d === "long" ? "lower-high" : "higher-low"}`,
    ],
    factors: {
      tp_adx4h: round(adx, 2),
      tp_zone: zone.type,
      tp_engulf: engulf,
      tp_break: Boolean(brk),
      tp_ema50_1h: round(ema50_1h, 8),
    },
  });
}

export const trendPullback: Strategy = { name: "trend_pullback", evaluate };
