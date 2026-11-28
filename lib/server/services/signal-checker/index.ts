import { getCurrentFundingRate, getKlines } from "../binance.service";
import type { Candle } from "../../types/index";
import { checkWithAi } from "./ai";
import { evaluateRules } from "./rules";
import { buildSnapshot } from "./snapshot";
import type { CheckResult, MarketSnapshot } from "./types";

export type { CheckResult, MarketSnapshot } from "./types";

export interface SignalCheckOptions {
  /** Yangiliklar avtomatik tekshirilmaydi — foydalanuvchi beradi. */
  newsWithin30min: boolean | null;
  tradesToday: number | null;
  consecutiveLosses: number | null;
  useAi: boolean;
}

export interface SignalCheckResponse {
  snapshot: MarketSnapshot;
  /** Yakuniy qaror — deterministik qoidalar. */
  result: CheckResult;
  /** AI ning mustaqil javobi (o'chiq yoki xato bo'lsa null). */
  ai: CheckResult | null;
  /** AI qarori qoidalar bilan mos keldimi (AI yo'q bo'lsa null). */
  agree: boolean | null;
}

const closed = (candles: Candle[]) => candles.filter((c) => c.closeTime <= Date.now());

export async function runSignalCheck(symbol: string, options: SignalCheckOptions): Promise<SignalCheckResponse> {
  const [c5m, c15m, c1h, c4h, fundingRate] = await Promise.all([
    getKlines(symbol, "5m", 300, "futures"),
    getKlines(symbol, "15m", 300, "futures"),
    getKlines(symbol, "1h", 300, "futures"),
    getKlines(symbol, "4h", 300, "futures"),
    getCurrentFundingRate(symbol).catch(() => null),
  ]);

  const snapshot = buildSnapshot({
    symbol,
    c5m: closed(c5m),
    c15m: closed(c15m),
    c1h: closed(c1h),
    c4h: closed(c4h),
    fundingRate,
    newsWithin30min: options.newsWithin30min,
    tradesToday: options.tradesToday,
    consecutiveLosses: options.consecutiveLosses,
  });

  const result = evaluateRules(snapshot);
  const ai = options.useAi ? await checkWithAi(snapshot) : null;
  if (ai && ai.decision !== result.decision) {
    result.warnings.push(`AI boshqa qaror berdi (${ai.decision}) — qoidalar natijasi ustun.`);
  }
  return { snapshot, result, ai, agree: ai ? ai.decision === result.decision : null };
}
