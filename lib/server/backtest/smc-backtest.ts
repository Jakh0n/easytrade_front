import { calculateEMA } from "../services/indicators.service";
import { evaluateSignalOutcome, SIGNAL_MAX_BARS } from "../services/fq-strategy/outcome";
import {
  SMC_CONFIG,
  computeSmcSeries,
  resolvePending,
  smcSetupAt,
  type SmcConfig,
  type SmcSetup,
} from "../services/smc/engine";
import type { BacktestTrade } from "./fq-backtest";
import type { Candle } from "../types/index";

export { SMC_CONFIG, type SmcConfig };

/**
 * SMC / OTE modelini tarixda live bilan bir xil qoidalarda o'ynatadi (`services/smc/engine.ts`):
 * kutilayotgan limit order yangi setup chiqsa almashtiriladi; pozitsiya ochiq paytda yangi setup olinmaydi.
 * Kirish limit (maker), chiqish taker.
 */
export function backtestSmc(
  symbol: string,
  candles: Candle[],
  htf: Candle[],
  config: SmcConfig = SMC_CONFIG,
  costs: { maker: number; taker: number } = { maker: 0.0002, taker: 0.0007 },
): BacktestTrade[] {
  const series = computeSmcSeries(candles, config);
  const htfEma = calculateEMA(
    htf.map((c) => c.close),
    200,
  );

  const setups: SmcSetup[] = [];
  let h = -1;
  for (let t = 250; t < candles.length - 1; t++) {
    while (h + 1 < htf.length && htf[h + 1]!.closeTime <= candles[t]!.closeTime) h++;
    const dir =
      h >= 199 && Number.isFinite(htfEma[h]!) ? Math.sign(htf[h]!.close - htfEma[h]!) : 0;
    const setup = smcSetupAt(series, t, dir, config);
    if (setup) setups.push(setup);
  }

  const trades: BacktestTrade[] = [];
  let busyUntil = -Infinity;
  for (let k = 0; k < setups.length; k++) {
    const s = setups[k]!;
    if (candles[s.index]!.closeTime <= busyUntil) continue;
    const next = setups.slice(k + 1).find((x) => candles[x.index]!.closeTime > busyUntil);
    const window = candles.slice(s.index + 1, next ? next.index + 1 : undefined);
    const res = resolvePending(s, window, config.maxWait);
    if (res.state !== "filled") continue;

    const fill = s.index + 1 + res.index;
    const risk = Math.abs(s.entry - s.stopLoss);
    const costR = ((costs.maker + costs.taker) * s.entry) / risk;
    const base = {
      symbol,
      side: s.side,
      setup: "pullback" as const,
      signalTime: s.signalTime,
      costR,
      confluences: [config.entry === "ob" ? "OB" : `OTE ${config.entryFib}`],
    };
    if (res.stoppedOnFill) {
      trades.push({ ...base, closedAt: candles[fill]!.closeTime, status: "sl", grossR: -1, netR: -1 - costR });
      busyUntil = candles[fill]!.closeTime;
      continue;
    }
    const outcome = evaluateSignalOutcome(s, candles.slice(fill + 1, fill + 1 + SIGNAL_MAX_BARS));
    if (outcome.resultR === null || outcome.closedAt === null) break;
    trades.push({ ...base, closedAt: outcome.closedAt, status: outcome.status, grossR: outcome.resultR, netR: outcome.resultR - costR });
    busyUntil = outcome.closedAt;
  }
  return trades;
}
