import { z } from "zod";
import { marketTypeSchema } from "./market.validator";

const symbolSchema = z
  .string()
  .trim()
  .min(1, "symbol majburiy")
  .transform((value) => value.toUpperCase());

export const watchlistAddSchema = z.object({
  symbol: symbolSchema,
  marketType: marketTypeSchema,
  note: z.string().trim().max(200).optional(),
});

export const tradeCreateSchema = z.object({
  symbol: symbolSchema,
  marketType: marketTypeSchema,
  side: z.enum(["long", "short"]),
  strategy: z.string().trim().max(60).optional(),
  entryPrice: z.coerce.number().positive(),
  stopLoss: z.coerce.number().positive(),
  takeProfit: z.coerce.number().positive(),
  size: z.coerce.number().positive(),
  notes: z.string().trim().max(500).optional(),
});

export const tradeCloseSchema = z.object({
  exitPrice: z.coerce.number().positive(),
  notes: z.string().trim().max(500).optional(),
});

export const alertCreateSchema = z.object({
  symbol: symbolSchema,
  marketType: marketTypeSchema,
  type: z.enum(["price_above", "price_below", "entry_zone", "verdict_enter"]),
  targetPrice: z.coerce.number().positive().optional(),
  interval: z.enum(["15m", "1h", "4h", "1d", "1w"]).optional(),
});

export type WatchlistAddBody = z.infer<typeof watchlistAddSchema>;
export type TradeCreateBody = z.infer<typeof tradeCreateSchema>;
export type TradeCloseBody = z.infer<typeof tradeCloseSchema>;
export type AlertCreateBody = z.infer<typeof alertCreateSchema>;
