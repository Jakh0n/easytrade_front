import { z } from "zod";

export const marketTypeSchema = z.enum(["spot", "futures"]).default("futures");

const symbolSchema = z
  .string()
  .trim()
  .min(1, "symbol majburiy")
  .max(20)
  .regex(/^[A-Za-z0-9]+$/, "symbol faqat harf va raqamdan iborat bo'lishi kerak")
  .transform((value) => {
    const upper = value.toUpperCase();
    return upper.endsWith("USDT") ? upper : `${upper}USDT`;
  });

export const fqAnalyzeQuerySchema = z.object({
  symbol: symbolSchema,
  marketType: marketTypeSchema,
});

export const fqScanQuerySchema = z.object({
  marketType: marketTypeSchema,
  refresh: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),
});

export type FqAnalyzeQuery = z.infer<typeof fqAnalyzeQuerySchema>;
export type FqScanQuery = z.infer<typeof fqScanQuerySchema>;

export const signalsQuerySchema = z.object({
  strategy: z.enum(["fq_v3", "fq_4h", "smc_4h", "smc_5m", "smc_mtf"]).optional(),
});

export type SignalsQuery = z.infer<typeof signalsQuerySchema>;

const flag = z
  .enum(["0", "1", "true", "false"])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === "1" || value === "true"));

export const signalCheckQuerySchema = z.object({
  symbol: symbolSchema,
  /** 30 daqiqa ichida muhim yangilik bormi (avtomatik tekshirilmaydi). */
  news: flag.transform((value) => value ?? false),
  tradesToday: z.coerce.number().int().min(0).max(100).default(0),
  consecutiveLosses: z.coerce.number().int().min(0).max(100).default(0),
  ai: flag.transform((value) => value ?? true),
});

export type SignalCheckQuery = z.infer<typeof signalCheckQuerySchema>;
