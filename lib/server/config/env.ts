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
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o"),
  /** Public URL (e.g. https://your-app.onrender.com). Render also sets RENDER_EXTERNAL_URL. */
  APP_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  TELEGRAM_SIGNALS_ENABLED: boolFromEnv(false),
  TELEGRAM_SEND_EMA_SMC: boolFromEnv(true),
  TELEGRAM_SEND_SCREENER: boolFromEnv(true),
  TELEGRAM_SEND_INVEST: boolFromEnv(false),
  TELEGRAM_SIGNAL_MARKET: z.enum(["spot", "futures"]).default("futures"),
  TELEGRAM_SIGNAL_MIN_SCORE: z.coerce.number().min(0).max(100).default(75),
  TELEGRAM_MIN_CONFIDENCE: z.coerce.number().min(0).max(100).default(70),
  TELEGRAM_SIGNAL_MIN_RR: z.coerce.number().min(1).default(2),
  TELEGRAM_SIGNAL_COOLDOWN_HOURS: z.coerce.number().min(1).default(4),
  TELEGRAM_MAX_SIGNALS_PER_RUN: z.coerce.number().min(1).max(20).default(5),
  TELEGRAM_MAX_SIGNALS_PER_DAY: z.coerce.number().min(1).max(100).default(20),
  TELEGRAM_SIGNAL_CRON: z.string().default("*/5 * * * *"),
  TELEGRAM_SCREENER_INTERVAL: z
    .enum(["15m", "1h", "4h", "1d"])
    .default("4h"),
  /** @deprecated use TELEGRAM_SEND_EMA_SMC */
  TELEGRAM_SIGNAL_STRATEGY: z.enum(["ema_smc"]).default("ema_smc"),
  /** chart-img.com API — TradingView (Binance) chart snapshots */
  CHART_IMG_API_KEY: z.string().optional(),
  /** Free plan max: 800×600. Pro: 1920×1080 */
  CHART_IMG_WIDTH: z.coerce.number().min(320).max(1920).default(800),
  CHART_IMG_HEIGHT: z.coerce.number().min(220).max(1080).default(600),
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
