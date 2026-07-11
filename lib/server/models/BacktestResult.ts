import mongoose, { Schema, model, type InferSchemaType } from "mongoose";

const backtestResultSchema = new Schema(
  {
    symbol: { type: String, required: true, uppercase: true, trim: true },
    interval: { type: String, required: true },
    marketType: { type: String, required: true, enum: ["spot", "futures"] },
    summary: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

backtestResultSchema.index(
  { symbol: 1, interval: 1, marketType: 1 },
  { unique: true },
);

export type BacktestResultDoc = InferSchemaType<typeof backtestResultSchema>;

export const BacktestResult =
  mongoose.models.BacktestResult ?? model("BacktestResult", backtestResultSchema);
