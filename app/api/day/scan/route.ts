import { createRouteHandler, json } from "@/lib/server/http/route";
import { runDayScan } from "@/lib/server/services/day.strategy.service";
import { fqScanQuerySchema, type FqScanQuery } from "@/lib/server/validators/market.validator";

export const maxDuration = 60;

export const GET = createRouteHandler(
  async (ctx) => {
    const { marketType, refresh } = ctx.query as FqScanQuery;
    return json(await runDayScan(marketType, { fresh: refresh }));
  },
  { auth: true, querySchema: fqScanQuerySchema },
);
