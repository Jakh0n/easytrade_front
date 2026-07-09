import {
  createRouteHandler,
  json,
} from "@/lib/server/http/route";
import { buildTechnicalAnalysis } from "@/lib/server/services/analysis.service";
import {
  analyzeBodySchema,
  type AnalyzeBody,
} from "@/lib/server/validators/market.validator";

export const POST = createRouteHandler(
  async (ctx) => {
    const { symbol, capital, riskPercent, interval, marketType } =
      ctx.body as AnalyzeBody;

    const analysis = await buildTechnicalAnalysis(
      symbol,
      interval,
      capital,
      riskPercent,
      marketType,
    );

    return json(analysis);
  },
  { bodySchema: analyzeBodySchema },
);
