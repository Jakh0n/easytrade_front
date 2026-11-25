import { createRouteHandler, noContent } from "@/lib/server/http/route";
import { sendTestTelegramMessage } from "@/lib/server/services/fq-signal.service";
import { isTelegramConfigured } from "@/lib/server/services/telegram.service";
import { AppError } from "@/lib/server/utils/AppError";

export const POST = createRouteHandler(
  async () => {
    if (!isTelegramConfigured()) {
      throw new AppError("TELEGRAM_BOT_TOKEN va TELEGRAM_CHANNEL_ID sozlanmagan", 400);
    }
    try {
      await sendTestTelegramMessage();
    } catch (error) {
      throw new AppError(
        `Telegram xatosi: ${error instanceof Error ? error.message : String(error)}`,
        502,
      );
    }
    return noContent();
  },
  { auth: true },
);
