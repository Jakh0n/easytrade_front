import mongoose, { Schema, model, type InferSchemaType } from "mongoose";

const settingsSchema = new Schema(
  {
    capital: { type: Number, default: 10_000, min: 1 },
    riskPercent: { type: Number, default: 2, min: 0.1, max: 100 },
    marketType: { type: String, enum: ["spot", "futures"], default: "spot" },
    theme: { type: String, enum: ["light", "dark", "system"], default: "system" },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User = mongoose.models.User ?? model("User", userSchema);
