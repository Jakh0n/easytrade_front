import mongoose, { Schema, model, type InferSchemaType } from "mongoose";

const legSchema = new Schema(
  {
    symbol: { type: String, required: true },
    price: { type: Number, required: true },
    score: { type: Number, required: true },
    weight: { type: Number, required: true },
  },
  { _id: false },
);

/** Haftalik momentum savati (dushanba 00:00 UTC). `weekStart` — idempotentlik kaliti. */
const momentumBasketSchema = new Schema(
  {
    weekStart: { type: Date, required: true, unique: true },
    longs: { type: [legSchema], default: [] },
    shorts: { type: [legSchema], default: [] },
    universe: { type: Number, default: 0 },
    /** Shu savatning keyingi rebalansgacha daromadi (xarajatsiz), yopilganda yoziladi. */
    resultPct: { type: Number, default: null },
    telegramMessageId: { type: Number, default: null },
  },
  { timestamps: true },
);

export type MomentumBasketDoc = InferSchemaType<typeof momentumBasketSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MomentumBasket =
  (mongoose.models.MomentumBasket as mongoose.Model<MomentumBasketDoc> | undefined) ??
  model<MomentumBasketDoc>("MomentumBasket", momentumBasketSchema);
