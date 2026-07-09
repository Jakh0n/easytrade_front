export const runtime = "nodejs";
export const maxDuration = 60;

import {
  createRouteHandler,
  json,
} from "@/lib/server/http/route";
import { buildInvestAnalysis } from "@/lib/server/services/invest.service";
import {
  investBodySchema,
  type InvestBody,
} from "@/lib/server/validators/market.validator";

export const POST = createRouteHandler(
  async (ctx) => {
    const { symbol, capital, horizon } = ctx.body as InvestBody;
    const analysis = await buildInvestAnalysis(symbol, capital, horizon);
    return json(analysis);
  },
  { bodySchema: investBodySchema },
);
