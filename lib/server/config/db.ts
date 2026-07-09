import mongoose from "mongoose";
import { env } from "./env";

const RETRY_DELAY_MS = 10_000;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

let eventsRegistered = false;
let retryScheduled = false;

function registerConnectionEvents(): void {
  if (eventsRegistered) {
    return;
  }
  eventsRegistered = true;

  mongoose.set("strictQuery", true);
  mongoose.set("bufferCommands", false);

  mongoose.connection.on("connected", () => {
    console.log("MongoDB ulandi");
  });
  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB uzildi");
    cached.conn = null;
    cached.promise = null;
  });
  mongoose.connection.on("error", (error: unknown) => {
    console.error(
      "MongoDB xatosi:",
      error instanceof Error ? error.message : error,
    );
  });
}

async function connectOnce(): Promise<typeof mongoose> {
  registerConnectionEvents();

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 10,
      })
      .then((connection) => {
        cached.conn = connection;
        return connection;
      })
      .catch((error) => {
        cached.promise = null;
        cached.conn = null;
        throw error;
      });
  }

  return cached.promise;
}

function scheduleRetry(): void {
  if (retryScheduled) {
    return;
  }
  retryScheduled = true;
  setTimeout(() => {
    retryScheduled = false;
    void connectDatabase();
  }, RETRY_DELAY_MS);
}

/** Startup hook (instrumentation) — best-effort warm connect. */
export async function connectDatabase(): Promise<void> {
  try {
    await connectOnce();
    retryScheduled = false;
  } catch (error) {
    console.error(
      "MongoDB ulanmadi (persist funksiyalari ishlamaydi), qayta urinaman:",
      error instanceof Error ? error.message : error,
    );
    scheduleRetry();
  }
}

/** Lazy connect for API route handlers (serverless-safe). */
export async function ensureDatabaseConnected(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  try {
    await connectOnce();
    return true;
  } catch (error) {
    console.error(
      "MongoDB ulanmadi:",
      error instanceof Error ? error.message : error,
    );
    scheduleRetry();
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  cached.conn = null;
  cached.promise = null;
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
