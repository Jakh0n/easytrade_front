import { createRouteHandler, json } from "@/lib/server/http/route";
import { runInvestScreener } from "@/lib/server/services/invest-screener.service";
import {
  investScreenerQuerySchema,
  type InvestScreenerQuery,
} from "@/lib/server/validators/market.validator";

export const GET = createRouteHandler(
  async (ctx) => {
    const { horizon, limit } = ctx.query as InvestScreenerQuery;
    const response = await runInvestScreener(horizon, limit);
    return json(response);
  },
  { querySchema: investScreenerQuerySchema },
);
