/**
 * Supporting factors — they only ADD confidence points to a signal that a strategy already
 * produced; they never create a signal. Their raw values are stored for stats / ML.
 */
import type { EngineConfig } from "./config";
import { findSwings, last, oiAt, pctChange, percentileOfLast, sma, type Indicators } from "./indicators";
import type { FactorValue, MarketData, Signal } from "./types";
import { round, sign } from "./strategies/helpers";
import type { RegimeInfo } from "./regime";

/** Divergence between price and an oscillator on the last two 15m swing points of the side. */
function divergence(data: MarketData, osc: number[], direction: Signal["direction"], cfg: EngineConfig): boolean {
  const c = data.c15m;
  const from = Math.max(0, c.length - cfg.factors.divergenceLookback);
  const window = c.slice(from);
  const swings = findSwings(window, cfg.factors.divergencePivot);
  const points = direction === "long" ? swings.lows : swings.highs;
  if (points.length < 2) return false;
  const a = points.at(-2)!;
  const b = points.at(-1)!;
  const oa = osc[from + a.index]!;
  const ob = osc[from + b.index]!;
  if (!Number.isFinite(oa) || !Number.isFinite(ob)) return false;
  // Bullish: lower low in price, higher low in oscillator. Bearish: mirror.
  return direction === "long" ? b.price < a.price && ob > oa : b.price > a.price && ob < oa;
}

export function supportingFactors(
  signal: Signal,
  data: MarketData,
  ind: Indicators,
  cfg: EngineConfig,
): { points: number; reasons: string[]; factors: Record<string, FactorValue> } {
  const f = cfg.factors;
  const s = sign(signal.direction);
  const rsiDiv = divergence(data, ind.m15.rsi, signal.direction, cfg);
  const cvdDiv = divergence(data, ind.m15.cvd, signal.direction, cfg);

  const n1 = data.c1h.length;
  const symChange = n1 > f.rsHours ? pctChange(data.c1h[n1 - 1 - f.rsHours]!.close, data.c1h[n1 - 1]!.close) : NaN;
  const nb = data.btc1h.length;
  const btcChange = nb > f.rsHours ? pctChange(data.btc1h[nb - 1 - f.rsHours]!.close, data.btc1h[nb - 1]!.close) : NaN;
  const rs = symChange - btcChange;
  const rsOk = Number.isFinite(rs) && data.symbol !== "BTCUSDT" && s * rs > 0;

  const vwap = last(ind.m15.vwap);
  const vwapOk = s * (data.price - vwap) > 0;

  const reasons: string[] = [];
  if (rsiDiv) reasons.push("RSI divergence");
  if (cvdDiv) reasons.push("CVD divergence");
  if (rsOk) reasons.push(`RS vs BTC ${rs >= 0 ? "+" : ""}${rs.toFixed(1)}%`);
  if (vwapOk) reasons.push(`${s === 1 ? "Above" : "Below"} VWAP`);

  return {
    points: (rsiDiv ? f.rsiDivergencePts : 0) + (cvdDiv ? f.cvdDivergencePts : 0) + (rsOk ? f.rsPts : 0) + (vwapOk ? f.vwapPts : 0),
    reasons,
    factors: {
      sf_rsi_div: rsiDiv,
      sf_cvd_div: cvdDiv,
      sf_rs_btc_pct: round(rs, 3),
      sf_vwap_dist_pct: round(pctChange(vwap, data.price), 3),
    },
  };
}

/** Market-state features attached to every signal (independent of strategy) — the ML feature base. */
export function commonFactors(data: MarketData, ind: Indicators, regime: RegimeInfo, cfg: EngineConfig): Record<string, FactorValue> {
  const c = data.c15m;
  const n = c.length;
  const vols = c.map((x) => x.volume);
  const now = c.at(-1)?.closeTime ?? data.now;
  const atr15 = last(ind.m15.atr);
  return {
    regime: regime.regime,
    adx_4h: round(regime.adx, 2),
    atr_ratio_4h: round(regime.atrRatio, 3),
    trend_dir_4h: regime.trendDir,
    funding: data.funding,
    oi_chg_4h_pct: round(pctChange(oiAt(data.oi, now - 4 * 3_600_000), oiAt(data.oi, now)), 3),
    oi_chg_24h_pct: round(pctChange(oiAt(data.oi, now - 24 * 3_600_000), oiAt(data.oi, now)), 3),
    vol_ratio_15m: round(vols[n - 1]! / sma(vols, 20, n - 1), 3),
    rsi_15m: round(last(ind.m15.rsi), 2),
    bb_pct_15m: round(percentileOfLast(ind.m15.bbWidth, cfg.strategies.pre_pump.bbRankWindow), 2),
    atr15_pct: round((atr15 / data.price) * 100, 4),
    volume_24h_usd: Math.round(data.volume24hUsd),
    hour_utc: new Date(now).getUTCHours(),
  };
}
