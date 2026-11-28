import { createRouteHandler, json } from "@/lib/server/http/route";
import { evaluateMtf } from "@/lib/server/services/mtf-strategy/engine";
import { fetchMtfData } from "@/lib/server/services/mtf-strategy/signals";
import {
  signalCheckQuerySchema,
  type SignalCheckQuery,
} from "@/lib/server/validators/market.validator";

/** GET /api/signals/mtf?symbol=BTC&news=0&tradesToday=0&consecutiveLosses=0 — SMC MTF (4H → 1H → 5m) qarori. */
export const GET = createRouteHandler(
  async (ctx) => {
    const q = ctx.query as SignalCheckQuery;
    const data = await fetchMtfData(q.symbol);
    return json(
      evaluateMtf({
        symbol: q.symbol,
        ...data,
        newsWithin30min: q.news,
        tradesToday: q.tradesToday,
        consecutiveLosses: q.consecutiveLosses,
      }),
    );
  },
  { auth: true, querySchema: signalCheckQuerySchema },
);
