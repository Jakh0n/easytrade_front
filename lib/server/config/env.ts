import { z } from "zod";

function boolFromEnv(defaultValue = false) {
  return z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined) return defaultValue;
      if (typeof value === "boolean") return value;
      return value.toLowerCase() === "true";
    });
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/easytrade"),
  JWT_SECRET: z.string().min(1).default("dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),
  /** Public URL (masalan https://fq.vercel.app) — Telegram xabaridagi havola uchun. */
  APP_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  /** false bo'lsa signallar faqat saytda saqlanadi, Telegramga yuborilmaydi. */
  TELEGRAM_SIGNALS_ENABLED: boolFromEnv(false),
  TELEGRAM_SIGNAL_MARKET: z.enum(["spot", "futures"]).default("futures"),
  TELEGRAM_MAX_SIGNALS_PER_RUN: z.coerce.number().min(1).max(20).default(5),
  TELEGRAM_MAX_SIGNALS_PER_DAY: z.coerce.number().min(1).max(100).default(20),
  /** Day trade (Supertrend 15M) signallari — signal siklida FQ v3 bilan birga ishlaydi. */
  DAY_SIGNALS_ENABLED: boolFromEnv(true),
  /** Swing 1H (FQ v3) signallari. */
  FQ_1H_SIGNALS_ENABLED: boolFromEnv(true),
  /** Swing 4H + Fib signallari. */
  FQ_4H_SIGNALS_ENABLED: boolFromEnv(true),
  /** /api/signals/run ni himoyalaydi: `Authorization: Bearer <CRON_SECRET>`. */
  CRON_SECRET: z.string().min(16).optional(),
  /** true bo'lsa yangi foydalanuvchilar ro'yxatdan o'ta oladi (default: faqat birinchisi). */
  ALLOW_REGISTRATION: boolFromEnv(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Muhit o'zgaruvchilari noto'g'ri: ${issues}`);
}

export const env = parsed.data;
export type Env = typeof env;
