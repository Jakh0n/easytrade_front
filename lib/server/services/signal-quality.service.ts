import { env } from "../config/env";
import { getFundingRateRange, getKlines } from "./binance.service";
import { calculateEMA } from "./indicators.service";
import { getCurrentRegime, REGIME_FILTERS } from "./market-regime.service";
import { buildFeatures, computeFeatureSeries, fundingAt } from "./signal-model/features";
import { predictProbability } from "./signal-model/model";
import { SMC_SIGNAL_MODEL } from "./signal-model/weights";
import type { Candle, MarketType, StrategyId } from "../types/index";

/**
 * Yuqori timeframe tasdig'i — `scripts/signal-research.ts mtf/final` natijasi bo'yicha
 * (train va test davrlarining ikkalasida yaxshilagan variantlar):
 * - "stack":      yuqori TF'da close va EMA50 — EMA200 ning savdo tomonida;
 * - "notAgainst": yuqori TF EMA50/200 savdoga qarshi tartibda emas (neytral ham o'tadi).
 */
export const MTF_RULES: Partial<Record<StrategyId, { tf: string; rule: "stack" | "notAgainst" }>> = {
  fq_v3: { tf: "1d", rule: "stack" },
  fq_4h: { tf: "1d", rule: "stack" },
  smc_4h: { tf: "1d", rule: "stack" },
};

const closed = (candles: Candle[]) => candles.filter((c) => c.closeTime <= Date.now());

/** 1 = yuqoriga tartib, -1 = pastga, 0 = aralash / ma'lumot yetarli emas. */
export function emaStack(candles: Candle[]): number {
  if (candles.length < 200) return 0;
  const closes = candles.map((c) => c.close);
  const e50 = calculateEMA(closes, 50).at(-1)!;
  const e200 = calculateEMA(closes, 200).at(-1)!;
  const c = closes.at(-1)!;
  if (c > e200 && e50 > e200) return 1;
  if (c < e200 && e50 < e200) return -1;
  return 0;
}

export function mtfRuleAllows(rule: "stack" | "notAgainst", stack: number, side: "long" | "short"): boolean {
  const d = side === "long" ? 1 : -1;
  return rule === "stack" ? stack === d : stack !== -d;
}

/** Yuqori TF tasdig'i. Qoida yo'q, o'chirilgan yoki ma'lumot olinmasa — ruxsat (fail-open), xato `errors` ga. */
export async function mtfAllows(
  strategy: StrategyId,
  symbol: string,
  side: "long" | "short",
  market: MarketType,
  errors: string[],
): Promise<boolean> {
  const cfg = MTF_RULES[strategy];
  if (!cfg || !env.SIGNAL_QUALITY_FILTERS_ENABLED) return true;
  try {
    const candles = closed(await getKlines(symbol, cfg.tf, 300, market));
    return mtfRuleAllows(cfg.rule, emaStack(candles), side);
  } catch (error) {
    errors.push(`MTF ${strategy} ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    return true;
  }
}

/**
 * SMC setup'ining foyda bilan yopilish ehtimoli (logistik model). `candles` — setup chiqqan 4H shamlar
 * (oxirgisi — setup shami). Model xato bersa null.
 */
export async function smcSignalProbability(
  symbol: string,
  side: "long" | "short",
  candles: Candle[],
  market: MarketType,
): Promise<number | null> {
  try {
    const now = Date.now();
    const [funding, regime] = await Promise.all([
      getFundingRateRange(symbol, now - 8 * 86_400_000, now).catch(() => []),
      getCurrentRegime(REGIME_FILTERS.smc_4h.tf, market),
    ]);
    const index = candles.length - 1;
    const features = buildFeatures({
      candles,
      series: computeFeatureSeries(candles),
      index,
      side,
      barMs: 4 * 3_600_000,
      regime,
      funding: fundingAt(
        funding.map((f) => ({ t: f.fundingTime, r: f.rate })),
        candles[index]!.closeTime,
      ),
    });
    return predictProbability(SMC_SIGNAL_MODEL, features);
  } catch (error) {
    console.error(`SMC model ${symbol}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Model bo'yicha SMC setup o'tadimi (ehtimollik yo'q yoki filtr o'chiq — o'tadi). */
export function smcModelPasses(probability: number | null): boolean {
  if (!env.SIGNAL_QUALITY_FILTERS_ENABLED || probability === null) return true;
  return probability >= SMC_SIGNAL_MODEL.threshold;
}
