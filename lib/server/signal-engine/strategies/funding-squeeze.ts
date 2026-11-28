/**
 * 5.3 Funding / OI squeeze.
 *   Long (short squeeze):  funding < −0.05%, OI rising, price NOT making new lows,  15m MSB up
 *   Short (long squeeze):  funding > +0.08%, OI at local high, price NOT making new highs, 15m MSB down
 *   Bonus for the short: CVD declining.
 */
import { last, oiAt, pctChange } from "../indicators";
import type { Direction, Signal, Strategy, StrategyInput } from "../types";
import { buildEntry, freshStructureBreak, hoursMs, round, sign, zoneFromClose } from "./helpers";

function evaluate(symbol: string, input: StrategyInput): Signal | null {
  const { data, ind, cfg } = input;
  const p = cfg.strategies.funding_squeeze;
  const f = data.funding;
  if (f === null) return null;

  // 1. Funding extreme decides the side.
  const d: Direction | null = f < p.longFundingMax ? "long" : f > p.shortFundingMin ? "short" : null;
  if (!d) return null;
  const s = sign(d);

  // 2. OI condition.
  const now = data.c15m.at(-1)?.closeTime ?? data.now;
  const oiNow = oiAt(data.oi, now);
  const oiChangePct = pctChange(oiAt(data.oi, now - hoursMs(p.oiWindowHours)), oiNow);
  const oiMax24h = Math.max(...data.oi.filter((x) => x.time > now - hoursMs(24) && x.time <= now).map((x) => x.oi));
  const oiOk = d === "long" ? oiChangePct >= p.oiRisePct : oiNow >= p.oiLocalHighFrac * oiMax24h;
  if (!oiOk) return null;

  // 3. Price is not extending in the crowded direction (shorts are failing to push lower).
  const c = data.c15m;
  const n = c.length;
  if (n < p.recentBars + p.priorBars + 2) return null;
  const recent = c.slice(n - p.recentBars);
  const prior = c.slice(n - p.recentBars - p.priorBars, n - p.recentBars);
  const noNewExtreme =
    d === "long"
      ? Math.min(...recent.map((x) => x.low)) > Math.min(...prior.map((x) => x.low))
      : Math.max(...recent.map((x) => x.high)) < Math.max(...prior.map((x) => x.high));
  if (!noNewExtreme) return null;

  // 4. Trigger: 15m structure break in the squeeze direction.
  const brk = freshStructureBreak(c, ind.m15.swingHighs, ind.m15.swingLows, d, p.triggerSwingMaxAge);
  if (!brk) return null;

  const atr15 = last(ind.m15.atr);
  const trigger = c[n - 1]!;
  const zone = zoneFromClose(trigger.close, atr15, cfg.entryZoneAtr, d);
  const mid = (zone[0] + zone[1]) / 2;
  const opposite = (d === "long" ? ind.m15.swingLows : ind.m15.swingHighs).filter((x) => s * (mid - x.price) > 0).at(-1);
  const anchor = opposite?.price ?? (d === "long" ? Math.min(...recent.map((x) => x.low)) : Math.max(...recent.map((x) => x.high)));
  const stopLoss = anchor - s * p.slAtr * atr15;
  const risk = s * (mid - stopLoss);
  if (!(risk > 0)) return null;

  const cvd = ind.m15.cvd;
  const cvdSlope = cvd[n - 1]! - cvd[Math.max(0, n - 1 - p.cvdBars)]!;
  const cvdBonus = d === "short" && cvdSlope < 0;

  return buildEntry({
    input,
    strategy: "funding_squeeze",
    direction: d,
    zone,
    stopLoss,
    tp1: mid + s * p.tp1R * risk,
    tp2: mid + s * p.tp2R * risk,
    confidence: p.baseConfidence + Math.min(10, (Math.abs(f) / Math.abs(d === "long" ? p.longFundingMax : p.shortFundingMin) - 1) * 10) + (cvdBonus ? p.cvdBonus : 0),
    invalidation: { timeframe: "15m", level: stopLoss, description: "15m close beyond stop" },
    reasons: [
      `Funding ${(f * 100).toFixed(3)}%`,
      d === "long" ? `OI ${oiChangePct >= 0 ? "+" : ""}${oiChangePct.toFixed(1)}% / ${p.oiWindowHours}h` : "OI at 24h high",
      d === "long" ? "Shorts failing to make new lows" : "Longs failing to make new highs",
      `15m structure break ${d === "long" ? "up" : "down"}`,
      ...(cvdBonus ? ["CVD declining"] : []),
    ],
    factors: {
      fs_funding: f,
      fs_oi_chg_pct: round(oiChangePct, 2),
      fs_oi_vs_24h_max: round(oiNow / oiMax24h, 4),
      fs_cvd_slope: round(cvdSlope, 2),
      fs_cvd_bonus: cvdBonus,
    },
  });
}

export const fundingSqueeze: Strategy = { name: "funding_squeeze", evaluate };
