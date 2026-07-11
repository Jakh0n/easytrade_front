import mongoose, { Schema, model, type InferSchemaType } from "mongoose";

const watchlistSchema = new Schema(
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
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

watchlistSchema.index(
  { userId: 1, symbol: 1, marketType: 1 },
  { unique: true },
);

export type WatchlistDoc = InferSchemaType<typeof watchlistSchema>;

export const Watchlist =
  mongoose.models.Watchlist ?? model("Watchlist", watchlistSchema);
