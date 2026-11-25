import { createRouteHandler, json } from "@/lib/server/http/route";
import { buildFqAnalysis } from "@/lib/server/services/fq.strategy.service";
import {
  fqAnalyzeQuerySchema,
  type FqAnalyzeQuery,
} from "@/lib/server/validators/market.validator";

export const GET = createRouteHandler(
  async (ctx) => {
    const { symbol, marketType } = ctx.query as FqAnalyzeQuery;
    return json(await buildFqAnalysis(symbol, marketType));
  },
  { auth: true, querySchema: fqAnalyzeQuerySchema },
);
