import {
  createRouteHandler,
  json,
  requireUserId,
} from "@/lib/server/http/route";
import { closeTrade } from "@/lib/server/services/journal.service";
import {
  tradeCloseSchema,
  type TradeCloseBody,
} from "@/lib/server/validators/persist.validator";

export const PATCH = createRouteHandler(
  async (ctx) => {
    const body = ctx.body as TradeCloseBody;
    const trade = await closeTrade(requireUserId(ctx), ctx.params.id, body);
    return json({ trade });
  },
  { requireDb: true, auth: true, bodySchema: tradeCloseSchema },
);
