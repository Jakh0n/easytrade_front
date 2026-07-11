import cron, { type ScheduledTask } from "node-cron";
import { evaluateAlerts } from "../services/alert.service";
import { evaluateTelegramSignalHub } from "../services/telegram-hub.service";
import {
  getKeepAliveHealthUrl,
  pingHealthEndpoint,
} from "../services/keepalive.service";
import { isDatabaseConnected } from "./db";
import { env } from "./env";

const ALERT_CRON = "* * * * *"; // every minute
const KEEP_ALIVE_CRON = "*/14 * * * *"; // every 14 minutes

let alertTask: ScheduledTask | null = null;
let keepAliveTask: ScheduledTask | null = null;
let signalTask: ScheduledTask | null = null;

export function startSchedulers(): void {
  alertTask = cron.schedule(ALERT_CRON, () => {
    if (!isDatabaseConnected()) {
      return;
    }

    void evaluateAlerts().catch((error) => {
      console.error(
        "Alert baholash xatosi:",
        error instanceof Error ? error.message : error,
      );
    });
  });

  if (env.TELEGRAM_SIGNALS_ENABLED && cron.validate(env.TELEGRAM_SIGNAL_CRON)) {
    signalTask = cron.schedule(env.TELEGRAM_SIGNAL_CRON, () => {
      if (!isDatabaseConnected()) {
        return;
      }

      void evaluateTelegramSignalHub().catch((error) => {
        console.error(
          "Strategiya signal xatosi:",
          error instanceof Error ? error.message : error,
        );
      });
    });

    console.log(
      `Telegram Signal Hub yoqildi (cron: ${env.TELEGRAM_SIGNAL_CRON}, ema_smc: ${env.TELEGRAM_SEND_EMA_SMC}, screener: ${env.TELEGRAM_SEND_SCREENER})`,
    );
  }

  const keepAliveUrl = getKeepAliveHealthUrl();
  if (keepAliveUrl) {
    keepAliveTask = cron.schedule(KEEP_ALIVE_CRON, () => {
      void pingHealthEndpoint().catch((error) => {
        console.error(
          "Keep-alive ping xatosi:",
          error instanceof Error ? error.message : error,
        );
      });
    });

    console.log(`Keep-alive yoqildi: ${keepAliveUrl} (har 14 daqiqa)`);

    // Birinchi ping — deploy yoki cold start'dan keyin idle taymerni reset qiladi.
    void pingHealthEndpoint().catch((error) => {
      console.error(
        "Keep-alive boshlang'ich ping xatosi:",
        error instanceof Error ? error.message : error,
      );
    });
  }
}

export function stopSchedulers(): void {
  alertTask?.stop();
  alertTask = null;
  keepAliveTask?.stop();
  keepAliveTask = null;
  signalTask?.stop();
  signalTask = null;
}
