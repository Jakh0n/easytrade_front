import mongoose, { Schema, model, type InferSchemaType } from "mongoose";

export const SIGNAL_STATUSES = ["pending", "cancelled", "open", "tp1", "tp2", "be", "sl", "exit", "expired"] as const;
export const STRATEGY_IDS = ["fq_v3", "fq_4h", "smc_4h", "smc_5m", "smc_mtf"] as const;
/** O'chirilgan 15M strategiyalar — bazadagi eski yozuvlar o'qilishi uchun enum'da qoladi, kodda ishlatilmaydi. */
export const LEGACY_STRATEGY_IDS = ["fq_15m", "st_day"] as const;

const fqSignalSchema = new Schema(
  {
    /** fq_v3 = swing 1H, fq_4h = swing 4H + Fib, smc_4h = SMC OTE limit (4H), smc_5m = signal tekshiruvchi (sweep → zona → 5m trigger), smc_mtf = 4H trend → 1H zona + sweep → 5m CHoCH (limit). */
    strategy: { type: String, enum: [...STRATEGY_IDS, ...LEGACY_STRATEGY_IDS], default: "fq_v3", index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    marketType: { type: String, required: true, enum: ["spot", "futures"] },
    side: { type: String, required: true, enum: ["long", "short"] },
    setup: { type: String, enum: ["pullback", "breakout", null], default: null },
    /** Signal shamining openTime — (strategy, symbol, side, signalTime) bitta signal. */
    signalTime: { type: Date, required: true },
    entry: { type: Number, required: true },
    stopLoss: { type: Number, required: true },
    tp1: { type: Number, default: null },
    tp2: { type: Number, default: null },
    score: { type: Number, default: 0 },
    status: { type: String, enum: SIGNAL_STATUSES, default: "open", index: true },
    resultR: { type: Number, default: null },
    closedAt: { type: Date, default: null },
    /** SMC limit order: to'lgan shamning openTime'i va bekor qilish darajasi (impuls cho'qqisi). */
    filledAt: { type: Date, default: null },
    invalidate: { type: Number, default: null },
    telegramMessageId: { type: Number, default: null },
    sentAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

fqSignalSchema.index({ strategy: 1, symbol: 1, side: 1, signalTime: 1 }, { unique: true });
fqSignalSchema.index({ sentAt: -1 });

export type FqSignalDoc = InferSchemaType<typeof fqSignalSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const FqSignal =
  (mongoose.models.FqSignal as mongoose.Model<FqSignalDoc> | undefined) ??
  model<FqSignalDoc>("FqSignal", fqSignalSchema);
