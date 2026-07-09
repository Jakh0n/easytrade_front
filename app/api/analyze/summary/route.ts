import {
  createRouteHandler,
  createSSEStream,
} from "@/lib/server/http/route";
import { buildTechnicalAnalysis } from "@/lib/server/services/analysis.service";
import {
  isOpenAiConfigured,
  streamAnalysis,
} from "@/lib/server/services/openai.service";
import type { AnalysisInput } from "@/lib/server/types";
import {
  analyzeBodySchema,
  type AnalyzeBody,
} from "@/lib/server/validators/market.validator";

const AI_UNAVAILABLE_MESSAGE =
  "AI izoh hozircha mavjud emas. Texnik signal va risk darajalari to'liq hisoblangan.";

function toAnalysisInput(
  analysis: Awaited<ReturnType<typeof buildTechnicalAnalysis>>,
): AnalysisInput {
  return {
    symbol: analysis.symbol,
    currentPrice: analysis.currentPrice,
    trend: analysis.trend,
    marketType: analysis.marketType,
    indicators: analysis.indicators,
    risk: analysis.risk,
    strategy: analysis.strategy,
    verdict: analysis.verdict,
  };
}

export const POST = createRouteHandler(
  async (ctx) => {
    const { symbol, capital, riskPercent, interval, marketType } =
      ctx.body as AnalyzeBody;

    if (!isOpenAiConfigured()) {
      return createSSEStream(async (write) => {
        write({ token: AI_UNAVAILABLE_MESSAGE });
      });
    }

    return createSSEStream(async (write) => {
      try {
        const analysis = await buildTechnicalAnalysis(
          symbol,
          interval,
          capital,
          riskPercent,
          marketType,
        );

        for await (const token of streamAnalysis(toAnalysisInput(analysis))) {
          write({ token });
        }
      } catch (error) {
        console.error("AI izoh oqim xatosi:", error);
        write({ error: "AI izohda xato" });
      }
    });
  },
  { bodySchema: analyzeBodySchema },
);
