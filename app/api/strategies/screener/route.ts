import { createRouteHandler, json } from "@/lib/server/http/route";
import { runEmaSmcScreener } from "@/lib/server/services/strategy-screener.service";
import {
  strategyScreenerQuerySchema,
  type StrategyScreenerQuery,
} from "@/lib/server/validators/market.validator";
import { AppError } from "@/lib/server/utils/AppError";

export const GET = createRouteHandler(
  async (ctx) => {
    const { strategyId, marketType, limit } =
      ctx.query as StrategyScreenerQuery;

    if (strategyId !== "ema_smc") {
      throw new AppError("Strategiya topilmadi", 404);
    }

    const result = await runEmaSmcScreener(marketType, limit);
    return json(result);
  },
  { querySchema: strategyScreenerQuerySchema },
);
