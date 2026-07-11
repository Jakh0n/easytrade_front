import { z } from "zod";

export const intervalSchema = z
  .enum(["5m", "15m", "1h", "4h", "1d", "1w"])
  .default("4h");

export const marketTypeSchema = z.enum(["spot", "futures"]).default("spot");

export const analyzeBodySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "symbol majburiy")
    .transform((value) => value.toUpperCase()),
  capital: z.coerce
    .number()
    .positive("capital musbat bo'lishi kerak")
    .default(10_000),
  riskPercent: z.coerce
    .number()
    .positive("riskPercent musbat bo'lishi kerak")
    .max(10, "riskPercent 10% dan oshmasligi kerak — risk-menejment chegarasi")
    .default(2),
  interval: intervalSchema,
  marketType: marketTypeSchema,
});

export const screenerQuerySchema = z.object({
  interval: intervalSchema,
  marketType: marketTypeSchema,
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const backtestQuerySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "symbol majburiy")
    .transform((value) => value.toUpperCase()),
  interval: intervalSchema,
  marketType: marketTypeSchema,
});

export const investBodySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "symbol majburiy")
    .transform((value) => value.toUpperCase()),
  capital: z.coerce
    .number()
    .positive("capital musbat bo'lishi kerak")
    .default(100),
  horizon: z.enum(["1_3", "3_6", "6_12", "12_24"]).default("3_6"),
});

export const investScreenerQuerySchema = z.object({
  horizon: z.enum(["1_3", "3_6", "6_12", "12_24"]).default("3_6"),
  limit: z.coerce.number().int().positive().max(30).default(15),
});

export type AnalyzeBody = z.infer<typeof analyzeBodySchema>;
export type ScreenerQuery = z.infer<typeof screenerQuerySchema>;
export type BacktestQuery = z.infer<typeof backtestQuerySchema>;
export type InvestBody = z.infer<typeof investBodySchema>;
export type InvestScreenerQuery = z.infer<typeof investScreenerQuerySchema>;

export const strategyIdSchema = z.enum(["ema_smc"]);

export const strategyScreenerQuerySchema = z.object({
  strategyId: strategyIdSchema.default("ema_smc"),
  marketType: marketTypeSchema,
  limit: z.coerce.number().int().positive().max(30).default(15),
});

export const strategyAnalyzeBodySchema = z.object({
  strategyId: strategyIdSchema.default("ema_smc"),
  symbol: z
    .string()
    .trim()
    .min(1, "symbol majburiy")
    .transform((value) => value.toUpperCase()),
  marketType: marketTypeSchema,
});

export type StrategyScreenerQuery = z.infer<typeof strategyScreenerQuerySchema>;
export type StrategyAnalyzeBody = z.infer<typeof strategyAnalyzeBodySchema>;

export const strategySignalTestSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.toUpperCase())
    .optional(),
  marketType: marketTypeSchema.optional(),
  force: z.coerce.boolean().optional().default(false),
});

export type StrategySignalTestBody = z.infer<typeof strategySignalTestSchema>;
