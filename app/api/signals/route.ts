import { createRouteHandler, json } from "@/lib/server/http/route";
import { getSignalHistory } from "@/lib/server/services/fq-signal.service";
import { signalsQuerySchema, type SignalsQuery } from "@/lib/server/validators/market.validator";

export const GET = createRouteHandler(
  async (ctx) => {
    const { strategy } = ctx.query as SignalsQuery;
    return json(await getSignalHistory(100, strategy));
  },
  { auth: true, requireDb: true, querySchema: signalsQuerySchema },
);
