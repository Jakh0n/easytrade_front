import { Schema, model, type InferSchemaType } from "mongoose";

const alertSchema = new Schema(
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
    type: {
      type: String,
      required: true,
      enum: ["price_above", "price_below", "entry_zone", "verdict_enter"],
    },
    targetPrice: { type: Number, min: 0 },
    interval: { type: String, default: "4h" },
    status: {
      type: String,
      required: true,
      enum: ["active", "triggered", "cancelled"],
      default: "active",
    },
    message: { type: String, trim: true, default: "" },
    lastCheckedAt: { type: Date },
    triggeredAt: { type: Date },
  },
  { timestamps: true },
);

alertSchema.index({ status: 1, symbol: 1, marketType: 1 });

export type AlertDoc = InferSchemaType<typeof alertSchema>;

export const Alert = model("Alert", alertSchema);
