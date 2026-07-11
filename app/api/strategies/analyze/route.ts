import { createRouteHandler, json } from "@/lib/server/http/route";
import { buildEmaSmcAnalysis } from "@/lib/server/services/ema-smc.strategy.service";
import {
  strategyAnalyzeBodySchema,
  type StrategyAnalyzeBody,
} from "@/lib/server/validators/market.validator";
import { AppError } from "@/lib/server/utils/AppError";

export const POST = createRouteHandler(
  async (ctx) => {
    const { strategyId, symbol, marketType } =
      ctx.body as StrategyAnalyzeBody;

    if (strategyId !== "ema_smc") {
      throw new AppError("Strategiya topilmadi", 404);
    }

    const result = await buildEmaSmcAnalysis(symbol, marketType);
    return json(result);
  },
  { bodySchema: strategyAnalyzeBodySchema },
);
