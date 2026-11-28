import mongoose, { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Signal engine v2 — one row per decision group: sent, missed, rejected, suppressed, capped.
 *
 * ML-ready layout: `features` is a flat {name: number|bool|string} map captured at signal time,
 * and the label columns (`status`, `resultR`, `netR`, `mfeR`, `maeR`, `hitTp1`) are filled
 * by the lifecycle. Export rows where `sent = true` and the status is final to train a model
 * (e.g. XGBoost) that re-weights factors.
 */
export const ENGINE_DECISIONS = ["send", "upgrade", "missed", "rejected_rr", "suppressed_conflict", "capped"] as const;
export const ENGINE_STATUSES = [
  "pending", "open", "tp1", "tp2", "be", "sl", "expired", "invalidated", "timeout",
  "watch", "upgraded", "watch_expired",
  "missed", "rejected_rr", "suppressed_conflict", "capped",
] as const;

const componentSchema = new Schema(
  {
    strategy: { type: String, required: true },
    confidence: Number,
    entryZoneLow: Number,
    entryZoneHigh: Number,
    stopLoss: { type: Number, default: null },
    tp1: { type: Number, default: null },
    tp2: { type: Number, default: null },
    triggerTime: Date,
    rawKey: String,
    reasons: [String],
  },
  { _id: false },
);

const engineSignalSchema = new Schema(
  {
    /** Unique per decision group — re-running a cycle never duplicates a row. */
    key: { type: String, required: true, unique: true },
    symbol: { type: String, required: true, uppercase: true, index: true },
    direction: { type: String, enum: ["long", "short"], required: true },
    kind: { type: String, enum: ["entry", "watch"], required: true },
    regime: { type: String, enum: ["TREND", "RANGE", "HIGH_VOL"], required: true },
    strategies: { type: [String], index: true },
    primaryStrategy: { type: String, required: true },
    grade: { type: String, enum: ["A", "B", "C"], required: true },
    confidence: Number,
    decision: { type: String, enum: ENGINE_DECISIONS, required: true },
    note: { type: String, default: null },
    /** true when the group was emitted (Telegram on or not). */
    sent: { type: Boolean, default: false, index: true },
    entryZoneLow: Number,
    entryZoneHigh: Number,
    stopLoss: { type: Number, default: null },
    tp1: { type: Number, default: null },
    tp2: { type: Number, default: null },
    invalidation: { type: Schema.Types.Mixed, default: null },
    priceAtSignal: Number,
    atr15m: Number,
    reasons: [String],
    features: { type: Schema.Types.Mixed, default: {} },
    components: [componentSchema],
    rawKeys: { type: [String], index: true },
    createdAt: { type: Date, required: true, index: true },
    expiresAt: { type: Date, required: true },

    // ── outcome (labels) ──
    status: { type: String, enum: ENGINE_STATUSES, required: true, index: true },
    fillPrice: { type: Number, default: null },
    filledAt: { type: Date, default: null },
    tp1At: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    resultR: { type: Number, default: null },
    netR: { type: Number, default: null },
    costR: { type: Number, default: null },
    mfeR: { type: Number, default: 0 },
    maeR: { type: Number, default: 0 },
    hitTp1: { type: Boolean, default: false },
    lastProcessed: { type: Date, default: null },

    telegramMessageId: { type: Number, default: null },
    /** WATCH that this ENTRY upgraded, or group this row upgraded. */
    parentId: { type: Schema.Types.ObjectId, default: null },
    insertedAt: { type: Date, default: () => new Date() },
  },
  // `createdAt` above is the signal (decision) time, so Mongoose timestamps stay off.
  { timestamps: false },
);

engineSignalSchema.index({ sent: 1, status: 1 });
engineSignalSchema.index({ createdAt: -1, sent: 1 });

export type EngineSignalDoc = InferSchemaType<typeof engineSignalSchema> & { _id: mongoose.Types.ObjectId };

export const EngineSignal =
  (mongoose.models.EngineSignal as mongoose.Model<EngineSignalDoc> | undefined) ??
  model<EngineSignalDoc>("EngineSignal", engineSignalSchema);
