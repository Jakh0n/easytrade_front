import { createRouteHandler, json } from "@/lib/server/http/route";
import { evaluateTelegramSignalHub } from "@/lib/server/services/telegram-hub.service";

export const GET = createRouteHandler(
  async () => json(await evaluateTelegramSignalHub()),
  { requireDb: true },
);
