import type { EngineConfig, Regime, StrategyName } from "./config";
import { last, type H4Block } from "./indicators";
import type { Candle } from "../types/index";

export interface RegimeInfo {
  regime: Regime;
  adx: number;
  atrRatio: number;
  /** +1 EMA50 > EMA200 and close above EMA50, −1 mirror, 0 not aligned. */
  trendDir: 1 | -1 | 0;
}

/**
 * Per-symbol 4H regime:
 *   HIGH_VOL — ATR(14) > highVolAtrMult × its 50-bar average (checked first)
 *   TREND    — ADX > adxTrend and EMA50/EMA200 aligned with price
 *   RANGE    — everything else (ADX below threshold, or EMAs not aligned)
 */
export function detectRegime(c4h: Candle[], h4: H4Block, cfg: EngineConfig): RegimeInfo {
  const adx = last(h4.adx);
  const atr = last(h4.atr);
  const atrRatio = h4.atrAvg > 0 ? atr / h4.atrAvg : NaN;
  const close = c4h.at(-1)?.close ?? NaN;
  const fast = last(h4.emaFast);
  const slow = last(h4.emaSlow);
  const trendDir: 1 | -1 | 0 =
    fast > slow && close > fast ? 1 : fast < slow && close < fast ? -1 : 0;

  let regime: Regime;
  if (atrRatio > cfg.regime.highVolAtrMult) regime = "HIGH_VOL";
  else if (adx > cfg.regime.adxTrend && trendDir !== 0) regime = "TREND";
  else regime = "RANGE";

  return { regime, adx, atrRatio, trendDir };
}

export function strategiesFor(regime: Regime, cfg: EngineConfig): StrategyName[] {
  return cfg.routing[regime].filter((name) => cfg.strategies[name].enabled);
}
