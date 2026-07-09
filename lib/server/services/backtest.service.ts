import { isDatabaseConnected } from "../config/db";
import { BacktestResult } from "../models/BacktestResult";
import { getKlines } from "./binance.service";
import {
  calculateATR,
  calculateEMA,
  calculateRSI,
  findSupportResistance,
  getVolumeStatus,
} from "./indicators.service";
import { determineTrend } from "./risk.service";
import { buildStrategyVerdict, type StrategyType } from "./strategy.service";
import type {
  BacktestStrategyStat,
  BacktestSummary,
  Candle,
  MarketType,
  TradeSide,
} from "../types/index";

const HISTORY_LIMIT = 1000;
const WARMUP_BARS = 210;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Time stop: a trade that hits neither SL nor TP within this many bars is
// closed at market — capital must not stay locked in a dead setup.
const MAX_HOLD_BARS = 40;

const STRATEGY_LABELS: Record<StrategyType, string> = {
  trend_pullback: "Trend Pullback",
  breakout_retest: "Breakout + Retest",
  ema_crossover: "EMA Crossover",
  rsi_divergence: "RSI Divergence",
};

interface OpenTrade {
  side: Exclude<TradeSide, null>;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  strategy: StrategyType;
  openedIndex: number;
}

export interface ClosedTrade {
  strategy: StrategyType;
  rMultiple: number;
  win: boolean;
}

function lastFinite(values: number[]): number {
  const value = values[values.length - 1];
  return value !== undefined && Number.isFinite(value) ? value : NaN;
}

function resolveExit(trade: OpenTrade, candle: Candle): ClosedTrade | null {
  const risk =
    trade.side === "long"
      ? trade.entry - trade.stopLoss
      : trade.stopLoss - trade.entry;

  if (risk <= 0) {
    return null;
  }

  const hitStop =
    trade.side === "long"
      ? candle.low <= trade.stopLoss
      : candle.high >= trade.stopLoss;
  const hitTarget =
    trade.side === "long"
      ? candle.high >= trade.takeProfit
      : candle.low <= trade.takeProfit;

  // Conservative: if both levels touch in the same candle, assume the stop first.
  if (hitStop) {
    return { strategy: trade.strategy, rMultiple: -1, win: false };
  }

  if (hitTarget) {
    const reward =
      trade.side === "long"
        ? trade.takeProfit - trade.entry
        : trade.entry - trade.takeProfit;
    return { strategy: trade.strategy, rMultiple: reward / risk, win: true };
  }

  return null;
}

/** Market close at the given price (used by the time stop). */
function closeAtPrice(trade: OpenTrade, price: number): ClosedTrade | null {
  const risk =
    trade.side === "long"
      ? trade.entry - trade.stopLoss
      : trade.stopLoss - trade.entry;

  if (risk <= 0) {
    return null;
  }

  const pnl = trade.side === "long" ? price - trade.entry : trade.entry - price;
  const rMultiple = pnl / risk;

  return { strategy: trade.strategy, rMultiple, win: rMultiple > 0 };
}

export function summarizeBacktest(
  trades: ClosedTrade[],
): Omit<
  BacktestSummary,
  "symbol" | "interval" | "marketType" | "candlesAnalyzed" | "generatedAt"
> {
  const byStrategy = new Map<StrategyType, ClosedTrade[]>();
  for (const trade of trades) {
    const bucket = byStrategy.get(trade.strategy) ?? [];
    bucket.push(trade);
    byStrategy.set(trade.strategy, bucket);
  }

  const statFor = (
    list: ClosedTrade[],
  ): {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgR: number;
    expectancy: number;
  } => {
    const wins = list.filter((trade) => trade.win).length;
    const losses = list.length - wins;
    const totalR = list.reduce((sum, trade) => sum + trade.rMultiple, 0);
    const avgR = list.length > 0 ? totalR / list.length : 0;
    return {
      trades: list.length,
      wins,
      losses,
      winRate: list.length > 0 ? (wins / list.length) * 100 : 0,
      avgR,
      expectancy: avgR,
    };
  };

  const overall = statFor(trades);

  const strategyStats: BacktestStrategyStat[] = Array.from(
    byStrategy.entries(),
  ).map(([strategy, list]) => ({
    strategy,
    label: STRATEGY_LABELS[strategy],
    ...statFor(list),
  }));

  strategyStats.sort((a, b) => b.trades - a.trades);

  return { ...overall, byStrategy: strategyStats };
}

function runReplay(candles: Candle[], marketType: MarketType): ClosedTrade[] {
  const trades: ClosedTrade[] = [];
  let open: OpenTrade | null = null;

  for (let i = WARMUP_BARS; i < candles.length; i++) {
    const candle = candles[i]!;

    if (open) {
      const closed =
        resolveExit(open, candle) ??
        (i - open.openedIndex >= MAX_HOLD_BARS
          ? closeAtPrice(open, candle.close)
          : null);
      if (closed) {
        trades.push(closed);
        open = null;
      }
      continue;
    }

    const window = candles.slice(0, i + 1);
    const closes = window.map((item) => item.close);
    const price = closes[closes.length - 1]!;

    const ema50 = lastFinite(calculateEMA(closes, 50));
    const ema200 = lastFinite(calculateEMA(closes, 200));

    if (Number.isNaN(ema50) || Number.isNaN(ema200)) {
      continue;
    }

    const indicators = {
      ema50,
      ema200,
      rsi: calculateRSI(closes, 14),
      atr: calculateATR(window, 14),
      ...findSupportResistance(window, 30),
      volumeStatus: getVolumeStatus(window),
    };
    const trend = determineTrend(ema50, ema200, price);

    const verdict = buildStrategyVerdict({
      candles: window,
      currentPrice: price,
      trend,
      indicators,
      marketType,
    });

    if (verdict.verdict === "enter" && verdict.side !== null) {
      open = {
        side: verdict.side,
        entry: price,
        stopLoss: verdict.stopLoss,
        takeProfit: verdict.takeProfit,
        strategy: verdict.strategy.type,
        openedIndex: i,
      };
    }
  }

  return trades;
}

export async function runBacktest(
  symbol: string,
  interval: string,
  marketType: MarketType,
): Promise<BacktestSummary> {
  const normalizedSymbol = symbol.toUpperCase();

  if (isDatabaseConnected()) {
    const cached = await BacktestResult.findOne({
      symbol: normalizedSymbol,
      interval,
      marketType,
    }).lean();

    if (
      cached &&
      Date.now() - new Date(cached.updatedAt).getTime() < CACHE_TTL_MS
    ) {
      return cached.summary as BacktestSummary;
    }
  }

  const candles = await getKlines(
    normalizedSymbol,
    interval,
    HISTORY_LIMIT,
    marketType,
  );
  const trades = runReplay(candles, marketType);

  const summary: BacktestSummary = {
    symbol: normalizedSymbol,
    interval,
    marketType,
    candlesAnalyzed: candles.length,
    ...summarizeBacktest(trades),
    generatedAt: new Date().toISOString(),
  };

  if (isDatabaseConnected()) {
    await BacktestResult.findOneAndUpdate(
      { symbol: normalizedSymbol, interval, marketType },
      { summary },
      { upsert: true, new: true },
    );
  }

  return summary;
}
