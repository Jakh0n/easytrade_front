/**
 * 5.5 Breakout + Retest. On 15m:
 *   1. Range: the 20 bars before the breakout, height < 3 ATR
 *   2. Breakout: a close outside the range with volume > 2× average
 *   3. No close back inside since the breakout (else invalidated)
 *   4. Retest: the LAST closed bar touches the broken level and closes on the breakout side
 * Entry only on the retest, never on the breakout candle.
 */
import { last, sma } from "../indicators";
import type { Direction, Signal, Strategy, StrategyInput } from "../types";
import { buildEntry, round, sign } from "./helpers";

function evaluate(symbol: string, input: StrategyInput): Signal | null {
  const { data, ind, cfg } = input;
  const p = cfg.strategies.breakout_retest;
  const c = data.c15m;
  const n = c.length;
  const atr = ind.m15.atr;
  const vols = c.map((x) => x.volume);
  const retest = c[n - 1];
  if (!retest) return null;

  // Breakout bar b is strictly before the retest bar, within retestMaxBars.
  for (let b = n - 2; b >= Math.max(p.rangeBars + p.volAvgPeriod, n - 1 - p.retestMaxBars); b--) {
    const atrB = atr[b - 1]!;
    if (!Number.isFinite(atrB)) continue;
    let high = -Infinity;
    let low = Infinity;
    for (let i = b - p.rangeBars; i < b; i++) {
      high = Math.max(high, c[i]!.high);
      low = Math.min(low, c[i]!.low);
    }
    const height = high - low;
    if (!(height < p.maxRangeAtr * atrB)) continue; // 1

    const bar = c[b]!;
    const d: Direction | null = bar.close > high ? "long" : bar.close < low ? "short" : null;
    if (!d) continue;
    const avg = sma(vols, p.volAvgPeriod, b);
    const volRatio = avg > 0 ? bar.volume / avg : NaN;
    if (!(volRatio > p.volMult)) continue; // 2

    const s = sign(d);
    const level = d === "long" ? high : low;
    let backInside = false;
    for (let i = b + 1; i < n; i++) if (s * (c[i]!.close - level) <= 0) backInside = true;
    if (backInside) return null; // 3 — the most recent breakout failed

    const atrNow = last(atr);
    const tol = p.retestTolAtr * atrNow;
    const touched = d === "long" ? retest.low <= level + tol : retest.high >= level - tol;
    // Bars between breakout and retest must not have touched already — this is THE retest.
    let earlierTouch = false;
    for (let i = b + 1; i < n - 1; i++) {
      if (d === "long" ? c[i]!.low <= level + tol : c[i]!.high >= level - tol) earlierTouch = true;
    }
    if (!touched || earlierTouch) return null; // 4

    const zone: [number, number] = d === "long" ? [level, level + p.entryZoneAtr * atrNow] : [level - p.entryZoneAtr * atrNow, level];
    const mid = (zone[0] + zone[1]) / 2;
    return buildEntry({
      input,
      strategy: "breakout_retest",
      direction: d,
      zone,
      stopLoss: level - s * p.slAtr * atrNow,
      tp1: mid + s * p.tp1RangeMult * height,
      tp2: mid + s * p.tp2RangeMult * height,
      confidence: p.baseConfidence + Math.min(10, (volRatio - p.volMult) * 4),
      invalidation: { timeframe: "15m", level, description: "15m close back inside the range" },
      reasons: [
        `${p.rangeBars}-bar range (${(height / atrB).toFixed(1)} ATR) broken ${d === "long" ? "up" : "down"}`,
        `Breakout volume ${volRatio.toFixed(1)}x`,
        "Retest of broken level holding",
      ],
      factors: {
        br_range_atr: round(height / atrB, 3),
        br_vol_ratio: round(volRatio, 2),
        br_bars_since_breakout: n - 1 - b,
      },
    });
  }
  return null;
}

export const breakoutRetest: Strategy = { name: "breakout_retest", evaluate };
