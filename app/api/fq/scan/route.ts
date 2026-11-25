import { createRouteHandler, json } from "@/lib/server/http/route";
import { runFqScan } from "@/lib/server/services/fq-scanner.service";
import { fqScanQuerySchema, type FqScanQuery } from "@/lib/server/validators/market.validator";

export const maxDuration = 60;

export const GET = createRouteHandler(
  async (ctx) => {
    const { marketType, refresh } = ctx.query as FqScanQuery;
    return json(await runFqScan(marketType, { fresh: refresh }));
  },
  { auth: true, querySchema: fqScanQuerySchema },
);
