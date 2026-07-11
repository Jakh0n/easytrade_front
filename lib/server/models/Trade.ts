import mongoose, { Schema, model, type InferSchemaType } from "mongoose";

const tradeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    marketType: {
      type: String,
      required: true,
      enum: ["spot", "futures"],
      default: "spot",
    },
    side: { type: String, required: true, enum: ["long", "short"] },
    strategy: { type: String, trim: true, default: "" },
    entryPrice: { type: Number, required: true, min: 0 },
    stopLoss: { type: Number, required: true, min: 0 },
    takeProfit: { type: Number, required: true, min: 0 },
    size: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      required: true,
      enum: ["open", "closed"],
      default: "open",
    },
    exitPrice: { type: Number, min: 0 },
    rMultiple: { type: Number },
    pnl: { type: Number },
    notes: { type: String, trim: true, default: "" },
    openedAt: { type: Date, required: true, default: () => new Date() },
    closedAt: { type: Date },
  },
  { timestamps: true },
);

tradeSchema.index({ userId: 1, status: 1, openedAt: -1 });

export type TradeDoc = InferSchemaType<typeof tradeSchema>;

export const Trade = mongoose.models.Trade ?? model("Trade", tradeSchema);
