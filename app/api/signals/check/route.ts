import { createRouteHandler, json } from "@/lib/server/http/route";
import { runSignalCheck } from "@/lib/server/services/signal-checker";
import {
  signalCheckQuerySchema,
  type SignalCheckQuery,
} from "@/lib/server/validators/market.validator";

/** GET /api/signals/check?symbol=BTC&news=0&tradesToday=0&consecutiveLosses=0&ai=1 */
export const GET = createRouteHandler(
  async (ctx) => {
    const q = ctx.query as SignalCheckQuery;
    return json(
      await runSignalCheck(q.symbol, {
        newsWithin30min: q.news,
        tradesToday: q.tradesToday,
        consecutiveLosses: q.consecutiveLosses,
        useAi: q.ai,
      }),
    );
  },
  { auth: true, querySchema: signalCheckQuerySchema },
);
