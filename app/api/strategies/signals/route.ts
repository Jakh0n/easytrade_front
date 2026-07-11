import { createRouteHandler, json } from "@/lib/server/http/route";
import {
  evaluateTelegramSignalHub,
  sendTestSignal,
} from "@/lib/server/services/telegram-hub.service";
import {
  strategySignalTestSchema,
  type StrategySignalTestBody,
} from "@/lib/server/validators/market.validator";

export const GET = createRouteHandler(
  async () => json(await evaluateTelegramSignalHub()),
  { requireDb: true },
);

export const POST = createRouteHandler(
  async (ctx) => {
    const body = (ctx.body ?? {}) as StrategySignalTestBody;

    if (!body.symbol) {
      return json(await evaluateTelegramSignalHub());
    }

    const result = await sendTestSignal(
      body.symbol,
      body.marketType,
      body.force ?? false,
    );
    return json(result);
  },
  { requireDb: true, bodySchema: strategySignalTestSchema },
);
