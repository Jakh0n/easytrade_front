import type { StrategyName } from "../config";
import type { Strategy } from "../types";
import { breakoutRetest } from "./breakout-retest";
import { fundingSqueeze } from "./funding-squeeze";
import { liquiditySweep } from "./liquidity-sweep";
import { prePump } from "./pre-pump";
import { trendPullback } from "./trend-pullback";

/** Registry: add a module here and to `config.routing` to plug a new strategy in. */
export const STRATEGIES: Record<StrategyName, Strategy> = {
  trend_pullback: trendPullback,
  pre_pump: prePump,
  funding_squeeze: fundingSqueeze,
  liquidity_sweep: liquiditySweep,
  breakout_retest: breakoutRetest,
};
