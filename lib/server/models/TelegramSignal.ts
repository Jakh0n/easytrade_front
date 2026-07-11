import mongoose, { Schema, model, type InferSchemaType } from "mongoose";

export const TELEGRAM_SIGNAL_SOURCES = [
  "ema_smc",
  "screener",
  "invest",
] as const;

const telegramSignalSchema = new Schema(
  {
    sourceType: {
      type: String,
      required: true,
      enum: TELEGRAM_SIGNAL_SOURCES,
      index: true,
    },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    marketType: {
      type: String,
      required: true,
      enum: ["spot", "futures"],
    },
    side: { type: String, enum: ["long", "short", null], default: null },
    verdict: { type: String, required: true },
    score: { type: Number, required: true },
    riskReward: { type: Number, default: 0 },
    strategyLabel: { type: String, default: "" },
    telegramMessageId: { type: Number },
    sentAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

telegramSignalSchema.index({ symbol: 1, marketType: 1, side: 1, sentAt: -1 });
telegramSignalSchema.index({ sentAt: -1 });

export type TelegramSignalDoc = InferSchemaType<typeof telegramSignalSchema>;

export const TelegramSignal =
  mongoose.models.TelegramSignal ??
  model("TelegramSignal", telegramSignalSchema);

/** @deprecated Use TelegramSignal */
export const StrategySignal = TelegramSignal;
