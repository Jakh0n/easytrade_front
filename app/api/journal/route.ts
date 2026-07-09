import {
  createRouteHandler,
  json,
  requireUserId,
} from "@/lib/server/http/route";
import {
  createTrade,
  listTrades,
} from "@/lib/server/services/journal.service";
import {
  tradeCreateSchema,
  type TradeCreateBody,
} from "@/lib/server/validators/persist.validator";

export const GET = createRouteHandler(
  async (ctx) => {
    const status = ctx.request.nextUrl.searchParams.get("status") ?? undefined;
    const trades = await listTrades(requireUserId(ctx), status);
    return json({ trades });
  },
  { requireDb: true, auth: true },
);

export const POST = createRouteHandler(
  async (ctx) => {
    const body = ctx.body as TradeCreateBody;
    const trade = await createTrade(requireUserId(ctx), body);
    return json({ trade }, 201);
  },
  { requireDb: true, auth: true, bodySchema: tradeCreateSchema },
);
