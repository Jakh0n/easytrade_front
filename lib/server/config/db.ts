import mongoose from "mongoose";
import { env } from "./env";

const RETRY_DELAY_MS = 10_000;

let retryScheduled = false;

export async function connectDatabase(): Promise<void> {
  mongoose.set("strictQuery", true);
  // Fail fast instead of buffering queries for 10s when the DB is unreachable.
  mongoose.set("bufferCommands", false);

  mongoose.connection.on("connected", () => {
    console.log("MongoDB ulandi");
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB uzildi");
  });
  mongoose.connection.on("error", (error: unknown) => {
    console.error(
      "MongoDB xatosi:",
      error instanceof Error ? error.message : error,
    );
  });

  await connectWithRetry();
}

async function connectWithRetry(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    retryScheduled = false;
  } catch (error) {
    console.error(
      "MongoDB ulanmadi (persist funksiyalari ishlamaydi), qayta urinaman:",
      error instanceof Error ? error.message : error,
    );

    if (!retryScheduled) {
      retryScheduled = true;
      setTimeout(() => {
        retryScheduled = false;
        void connectWithRetry();
      }, RETRY_DELAY_MS);
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
