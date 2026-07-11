import { createRouteHandler, json } from "@/lib/server/http/route";
import { runMarketScreener } from "@/lib/server/services/screener.service";
import {
  screenerQuerySchema,
  type ScreenerQuery,
} from "@/lib/server/validators/market.validator";

export const GET = createRouteHandler(
  async (ctx) => {
    const { interval, marketType, limit } = ctx.query as ScreenerQuery;
    const result = await runMarketScreener(interval, limit, marketType);
    return json(result);
  },
  { querySchema: screenerQuerySchema },
);
