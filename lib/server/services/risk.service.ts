import type {
  FuturesGuidance,
  PositionSizingParams,
  PositionSizingResult,
  Trend,
} from "../types/index";

// Liquidation must sit at least this many stop-distances beyond the stop-loss,
// so a normal stop-out can never become a liquidation.
const LIQUIDATION_BUFFER = 3;
const MAX_LEVERAGE = 5;
const MIN_LEVERAGE = 1;

export function determineTrend(
  ema50: number,
  ema200: number,
  currentPrice: number,
): Trend {
  if (
    !Number.isFinite(ema50) ||
    !Number.isFinite(ema200) ||
    !Number.isFinite(currentPrice)
  ) {
    return "neutral";
  }

  if (ema50 > ema200 && currentPrice > ema50) {
    return "bullish";
  }

  if (ema50 < ema200 && currentPrice < ema50) {
    return "bearish";
  }

  return "neutral";
}

/**
 * Safe leverage from the stop distance: liquidation (~1/leverage away on
 * isolated margin) must be at least LIQUIDATION_BUFFER stop-distances beyond
 * the stop. E.g. a 2% stop allows at most ~1/(3*0.02) ≈ 5x.
 */
function buildFuturesGuidance(
  stopDistancePercent: number,
  notional: number,
): FuturesGuidance {
  const rawMax = 1 / (LIQUIDATION_BUFFER * (stopDistancePercent / 100));
  const maxSafeLeverage = Math.max(
    MIN_LEVERAGE,
    Math.min(MAX_LEVERAGE, Math.floor(rawMax)),
  );
  const suggestedLeverage = Math.max(
    MIN_LEVERAGE,
    Math.min(3, maxSafeLeverage),
  );
  const requiredMargin = notional / suggestedLeverage;

  return {
    suggestedLeverage,
    maxSafeLeverage,
    requiredMargin,
    note: `Isolated margin, maksimum ${maxSafeLeverage}x — likvidatsiya stop-loss'dan kamida ${LIQUIDATION_BUFFER} barobar uzoqda qoladi`,
  };
}

/**
 * Position sizing from the setup's own stop-loss. The stop-loss is decided by the
 * strategy verdict (side-aware, anchored to the invalidation level), so sizing
 * always reflects the real risk of the proposed trade.
 *
 * Spot positions are hard-capped at the available capital (no margin exists),
 * scaling the effective risk down accordingly. Futures positions additionally
 * get leverage guidance with a liquidation buffer.
 */
export function computePositionSizing(
  params: PositionSizingParams,
): PositionSizingResult {
  const { currentPrice, stopLoss, capital, riskPercent, marketType } = params;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error("currentPrice musbat son bo'lishi kerak");
  }

  if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
    throw new Error("stopLoss musbat son bo'lishi kerak");
  }

  if (!Number.isFinite(capital) || capital <= 0) {
    throw new Error("capital musbat son bo'lishi kerak");
  }

  if (!Number.isFinite(riskPercent) || riskPercent <= 0) {
    throw new Error("riskPercent musbat son bo'lishi kerak");
  }

  const priceRisk = Math.abs(currentPrice - stopLoss);

  if (priceRisk === 0) {
    return {
      positionSize: 0,
      riskAmount: 0,
      notional: 0,
      warning: "Stop loss narxi joriy narx bilan bir xil, ATR ni tekshiring",
    };
  }

  const riskAmount = (capital * riskPercent) / 100;
  let positionSize = riskAmount / priceRisk;
  let notional = positionSize * currentPrice;
  let warning: string | undefined;

  if (marketType === "spot" && notional > capital) {
    positionSize = capital / currentPrice;
    notional = capital;
    warning =
      "Spot pozitsiya kapital bilan cheklandi — real risk tanlangan foizdan past bo'ladi";
  }

  const result: PositionSizingResult = {
    positionSize,
    riskAmount: positionSize * priceRisk,
    notional,
  };

  if (warning) {
    result.warning = warning;
  }

  if (marketType === "futures") {
    const stopDistancePercent = (priceRisk / currentPrice) * 100;
    result.futures = buildFuturesGuidance(stopDistancePercent, notional);
  }

  return result;
}
