import { Trade } from "../models/Trade";
import { AppError } from "../utils/AppError";
import type { JournalStats, MarketType, TradeSide } from "../types/index";

interface CreateTradeInput {
  symbol: string;
  marketType: MarketType;
  side: Exclude<TradeSide, null>;
  strategy?: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  size: number;
  notes?: string;
}

interface CloseTradeInput {
  exitPrice: number;
  notes?: string;
}

function computeOutcome(
  side: "long" | "short",
  entryPrice: number,
  stopLoss: number,
  exitPrice: number,
  size: number,
): { rMultiple: number; pnl: number } {
  const riskPerUnit =
    side === "long" ? entryPrice - stopLoss : stopLoss - entryPrice;
  const pnlPerUnit =
    side === "long" ? exitPrice - entryPrice : entryPrice - exitPrice;

  return {
    rMultiple: riskPerUnit > 0 ? pnlPerUnit / riskPerUnit : 0,
    pnl: pnlPerUnit * size,
  };
}

export async function listTrades(userId: string, status?: string) {
  const filter: Record<string, unknown> = { userId };
  if (status === "open" || status === "closed") {
    filter.status = status;
  }
  return Trade.find(filter).sort({ openedAt: -1 }).lean();
}

export async function createTrade(userId: string, input: CreateTradeInput) {
  return Trade.create({
    userId,
    symbol: input.symbol,
    marketType: input.marketType,
    side: input.side,
    strategy: input.strategy ?? "",
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    size: input.size,
    notes: input.notes ?? "",
    status: "open",
    openedAt: new Date(),
  });
}

export async function closeTrade(
  userId: string,
  id: string,
  input: CloseTradeInput,
) {
  const trade = await Trade.findOne({ _id: id, userId });

  if (!trade) {
    throw new AppError("Trade topilmadi", 404);
  }

  if (trade.status === "closed") {
    throw new AppError("Trade allaqachon yopilgan", 400);
  }

  const { rMultiple, pnl } = computeOutcome(
    trade.side as "long" | "short",
    trade.entryPrice,
    trade.stopLoss,
    input.exitPrice,
    trade.size,
  );

  trade.status = "closed";
  trade.exitPrice = input.exitPrice;
  trade.rMultiple = rMultiple;
  trade.pnl = pnl;
  trade.closedAt = new Date();
  if (input.notes !== undefined) {
    trade.notes = input.notes;
  }

  await trade.save();
  return trade.toObject();
}

export async function deleteTrade(userId: string, id: string): Promise<void> {
  const result = await Trade.findOneAndDelete({ _id: id, userId });
  if (!result) {
    throw new AppError("Trade topilmadi", 404);
  }
}

export async function getJournalStats(userId: string): Promise<JournalStats> {
  const trades = await Trade.find({ userId }).sort({ closedAt: 1 }).lean();

  const closed = trades.filter((trade) => trade.status === "closed");
  const wins = closed.filter((trade) => (trade.pnl ?? 0) > 0).length;
  const losses = closed.length - wins;
  const totalPnl = closed.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const totalR = closed.reduce(
    (sum, trade) => sum + (trade.rMultiple ?? 0),
    0,
  );
  const avgR = closed.length > 0 ? totalR / closed.length : 0;

  let cumulative = 0;
  const equityCurve = closed.map((trade) => {
    cumulative += trade.pnl ?? 0;
    return {
      date: (trade.closedAt ?? trade.updatedAt).toISOString(),
      cumulativePnl: Number(cumulative.toFixed(2)),
    };
  });

  return {
    totalTrades: trades.length,
    openTrades: trades.length - closed.length,
    closedTrades: closed.length,
    wins,
    losses,
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
    avgR,
    expectancy: avgR,
    totalPnl,
    equityCurve,
  };
}
