import { getKlines } from "./binance.service";
import {
  calculateATR,
  calculateEMA,
  calculateRSI,
  findSupportResistance,
  getVolumeStatus,
} from "./indicators.service";
import { BTC_SYMBOLS, getBtcTrend } from "./market.service";
import {
  computeConfluence,
  getHigherTimeframeTrend,
  higherTimeframe,
} from "./mtf.service";
import { computePositionSizing, determineTrend } from "./risk.service";
import {
  buildStrategyVerdict,
  type StrategyDetection,
  type VerdictResult,
} from "./strategy.service";
import type {
  AnalysisRisk,
  MarketType,
  Trend,
  VolumeStatus,
} from "../types/index";

const KLINE_LIMIT = 300;

function getLastEma(emaValues: number[]): number {
  const lastValue = emaValues[emaValues.length - 1];

  if (lastValue === undefined || Number.isNaN(lastValue)) {
    throw new Error("EMA hisoblash uchun yetarli ma'lumot yo'q");
  }

  return lastValue;
}

export interface TechnicalAnalysis {
  symbol: string;
  interval: string;
  marketType: MarketType;
  currentPrice: number;
  trend: Trend;
  indicators: {
    ema50: number;
    ema200: number;
    rsi: number;
    atr: number;
    support: number;
    resistance: number;
    volumeStatus: VolumeStatus;
  };
  risk: AnalysisRisk & { warning?: string };
  strategy: StrategyDetection;
  verdict: VerdictResult;
}

/**
 * Applies a higher-timeframe filter to a single-timeframe verdict: attaches a
 * confluence score and downgrades an `enter` to `wait` when the HTF trend
 * actively opposes the trade direction. Failures are non-fatal.
 */
async function applyMultiTimeframe(
  verdict: VerdictResult,
  symbol: string,
  interval: string,
  trend: Trend,
  marketType: MarketType,
): Promise<VerdictResult> {
  const htfInterval = higherTimeframe(interval);

  try {
    const htfTrend =
      htfInterval === interval
        ? trend
        : await getHigherTimeframeTrend(symbol, htfInterval, marketType);

    const context = computeConfluence(
      verdict.side,
      trend,
      htfTrend,
      htfInterval,
    );

    const shouldDowngrade =
      verdict.verdict === "enter" && !context.aligned && verdict.side !== null;

    return {
      ...verdict,
      verdict: shouldDowngrade ? "wait" : verdict.verdict,
      verdictLabel: shouldDowngrade ? "KUTING" : verdict.verdictLabel,
      side: shouldDowngrade ? null : verdict.side,
      reason: shouldDowngrade
        ? `${context.note} — kirishni kuting`
        : verdict.reason,
      confluence: context.confluence,
      htfTrend: context.htfTrend,
      htfInterval: context.htfInterval,
      mtfNote: context.note,
    };
  } catch {
    return verdict;
  }
}

/**
 * Applies a BTC market-regime filter to an altcoin verdict. Most alts correlate
 * with BTC, so a long into a bearish BTC (or a short into a bullish BTC) is
 * fighting the market: such an `enter` is downgraded to `wait`. BTC itself and
 * BTC-neutral regimes are left unchanged. Failures are non-fatal.
 */
async function applyBtcFilter(
  verdict: VerdictResult,
  symbol: string,
  interval: string,
  marketType: MarketType,
): Promise<VerdictResult> {
  if (BTC_SYMBOLS.has(symbol)) {
    return verdict;
  }

  try {
    const regime = await getBtcTrend(interval, marketType);
    const change = regime.changePercent;
    const changeText = `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;

    if (verdict.side === null) {
      return {
        ...verdict,
        btcTrend: regime.trend,
        btcAligned: true,
        btcNote: `BTC ${regime.trend} (${changeText})`,
      };
    }

    const desired: Trend = verdict.side === "long" ? "bullish" : "bearish";
    const opposite: Trend = desired === "bullish" ? "bearish" : "bullish";
    const aligned = regime.trend !== opposite;
    const shouldDowngrade =
      verdict.verdict === "enter" && regime.trend === opposite;

    const note = !aligned
      ? `BTC ${regime.trend} (${changeText}) — bozor bosimi ${verdict.side}'ga qarshi`
      : regime.trend === desired
        ? `BTC ${regime.trend} (${changeText}) — bozor signalni qo'llab-quvvatlaydi`
        : `BTC neytral (${changeText}) — mustaqil harakat`;

    return {
      ...verdict,
      verdict: shouldDowngrade ? "wait" : verdict.verdict,
      verdictLabel: shouldDowngrade ? "KUTING" : verdict.verdictLabel,
      side: shouldDowngrade ? null : verdict.side,
      reason: shouldDowngrade ? `${note} — kirishni kuting` : verdict.reason,
      btcTrend: regime.trend,
      btcAligned: aligned,
      btcNote: note,
    };
  } catch {
    return verdict;
  }
}

export async function buildTechnicalAnalysis(
  symbol: string,
  interval: string = "4h",
  capital: number = 10_000,
  riskPercent: number = 2,
  marketType: MarketType = "spot",
  includeMtf: boolean = true,
): Promise<TechnicalAnalysis> {
  const normalizedSymbol = symbol.toUpperCase();
  const candles = await getKlines(
    normalizedSymbol,
    interval,
    KLINE_LIMIT,
    marketType,
  );
  const closes = candles.map((candle) => candle.close);
  const currentPrice = closes[closes.length - 1]!;

  const ema50 = getLastEma(calculateEMA(closes, 50));
  const ema200 = getLastEma(calculateEMA(closes, 200));
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(candles, 14);
  const { support, resistance } = findSupportResistance(candles, 30);
  const volumeStatus = getVolumeStatus(candles);
  const trend = determineTrend(ema50, ema200, currentPrice);

  const indicators = {
    ema50,
    ema200,
    rsi,
    atr,
    support,
    resistance,
    volumeStatus,
  };

  const baseVerdict = buildStrategyVerdict({
    candles,
    currentPrice,
    trend,
    indicators,
    marketType,
  });

  let verdict = baseVerdict;
  if (includeMtf) {
    verdict = await applyMultiTimeframe(
      baseVerdict,
      normalizedSymbol,
      interval,
      trend,
      marketType,
    );
    verdict = await applyBtcFilter(
      verdict,
      normalizedSymbol,
      interval,
      marketType,
    );
  }

  const sizing = computePositionSizing({
    currentPrice,
    stopLoss: verdict.stopLoss,
    capital,
    riskPercent,
    marketType,
  });

  return {
    symbol: normalizedSymbol,
    interval,
    marketType,
    currentPrice,
    trend,
    indicators,
    risk: {
      stopLoss: verdict.stopLoss,
      takeProfit: verdict.takeProfit,
      positionSize: sizing.positionSize,
      riskAmount: sizing.riskAmount,
      notional: sizing.notional,
      riskRewardRatio: verdict.rrIdeal,
      futures: sizing.futures,
      warning: sizing.warning,
    },
    strategy: verdict.strategy,
    verdict,
  };
}
