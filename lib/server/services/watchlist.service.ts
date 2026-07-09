import { Watchlist } from "../models/Watchlist";
import { AppError } from "../utils/AppError";
import type { MarketType } from "../types/index";

interface AddWatchlistInput {
  symbol: string;
  marketType: MarketType;
  note?: string;
}

export async function listWatchlist(userId: string) {
  return Watchlist.find({ userId }).sort({ createdAt: -1 }).lean();
}

export async function addWatchlistItem(
  userId: string,
  input: AddWatchlistInput,
) {
  try {
    return await Watchlist.create({
      userId,
      symbol: input.symbol,
      marketType: input.marketType,
      note: input.note ?? "",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      throw new AppError("Bu coin allaqachon ro'yxatda", 409);
    }
    throw error;
  }
}

export async function removeWatchlistItem(
  userId: string,
  id: string,
): Promise<void> {
  const result = await Watchlist.findOneAndDelete({ _id: id, userId });

  if (!result) {
    throw new AppError("Watchlist elementi topilmadi", 404);
  }
}
