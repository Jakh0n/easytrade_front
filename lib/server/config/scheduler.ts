import cron, { type ScheduledTask } from "node-cron";
import {
  getKeepAliveHealthUrl,
  pingHealthEndpoint,
} from "../services/keepalive.service";
import { isDatabaseConnected } from "./db";
import { env } from "./env";

const KEEP_ALIVE_CRON = "*/14 * * * *";

let keepAliveTask: ScheduledTask | null = null;
let signalTask: ScheduledTask | null = null;
let running = false;

function logError(label: string, error: unknown): void {
  console.error(label, error instanceof Error ? error.message : error);
}

/**
 * Doimiy ishlaydigan serverda (lokal `npm run dev`, Render, VPS) signal siklini
 * o'zi ishga tushiradi. Vercel serverless'da bu jarayon yashamaydi — u yerda
 * tashqi cron /api/signals/run ni chaqiradi (README ga qarang).
 */
export function startSchedulers(): void {
  if (process.env.VERCEL) return;

  if (env.TELEGRAM_SIGNALS_ENABLED && cron.validate(env.TELEGRAM_SIGNAL_CRON)) {
    signalTask = cron.schedule(env.TELEGRAM_SIGNAL_CRON, () => {
      if (running || !isDatabaseConnected()) return;
      running = true;
      void import("../services/fq-signal.service")
        .then(({ runSignalCycle }) => runSignalCycle())
        .then((result) => {
          if (result.newSignals || result.updated || result.errors.length) {
            console.log("FQ signal sikli:", JSON.stringify(result));
          }
        })
        .catch((error) => logError("FQ signal sikli xatosi:", error))
        .finally(() => {
          running = false;
        });
    });
    console.log(`FQ signal cron yoqildi: ${env.TELEGRAM_SIGNAL_CRON}`);
  }

  const keepAliveUrl = getKeepAliveHealthUrl();
  if (keepAliveUrl) {
    keepAliveTask = cron.schedule(KEEP_ALIVE_CRON, () => {
      void pingHealthEndpoint().catch((error) => logError("Keep-alive ping xatosi:", error));
    });
  }
}

export function stopSchedulers(): void {
  keepAliveTask?.stop();
  keepAliveTask = null;
  signalTask?.stop();
  signalTask = null;
}
