import {
  createRouteHandler,
  json,
} from "@/lib/server/http/route";
import { runBacktest } from "@/lib/server/services/backtest.service";
import {
  backtestQuerySchema,
  type BacktestQuery,
} from "@/lib/server/validators/market.validator";

export const GET = createRouteHandler(
  async (ctx) => {
    const { symbol, interval, marketType } = ctx.query as BacktestQuery;
    const summary = await runBacktest(symbol, interval, marketType);
    return json(summary);
  },
  { querySchema: backtestQuerySchema },
);
