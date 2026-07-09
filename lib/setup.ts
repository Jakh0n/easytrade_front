import type {
  AnalyzeIndicators,
  AnalyzeResponse,
  CandlePattern,
  FuturesGuidance,
  MarketType,
  StrategyChecklistItem,
  TradeSide,
  Trend,
  Verdict,
} from "@/lib/api";
import { formatPrice } from "@/lib/format";

export { formatPrice };

export interface TradeVerdictData {
  verdict: Verdict;
  verdictLabel: string;
  side: TradeSide;
  headline: string;
  reason: string;
  entryZone: [number, number];
  invalidation: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  rrNow: number;
  rrIdeal: number;
  trend: Trend;
  symbol: string;
  marketType: MarketType;
  strategyLabel: string;
  strategyConfidence: number;
  strategyDescription: string;
  checklist: StrategyChecklistItem[];
  indicators: AnalyzeIndicators;
  positionSize: number;
  riskAmount: number;
  notional: number;
  futures?: FuturesGuidance;
  pattern?: CandlePattern | null;
  warning?: string;
  confluence?: number;
  htfTrend?: Trend;
  htfInterval?: string;
  mtfNote?: string;
  btcTrend?: Trend;
  btcAligned?: boolean;
  btcNote?: string;
}

export function buildTradeVerdict(result: AnalyzeResponse): TradeVerdictData {
  const {
    verdict,
    strategy,
    risk,
    indicators,
    currentPrice,
    trend,
    symbol,
    marketType,
  } = result;

  return {
    verdict: verdict.verdict,
    verdictLabel: verdict.verdictLabel,
    side: verdict.side,
    headline: verdict.headline,
    reason: verdict.reason,
    entryZone: verdict.entryZone,
    invalidation: verdict.invalidation,
    stopLoss: risk.stopLoss,
    takeProfit: risk.takeProfit,
    currentPrice,
    rrNow: verdict.rrNow,
    rrIdeal: verdict.rrIdeal,
    trend,
    symbol,
    marketType,
    strategyLabel: strategy.label,
    strategyConfidence: strategy.confidence,
    strategyDescription: strategy.description,
    checklist: strategy.checklist,
    indicators,
    positionSize: risk.positionSize,
    riskAmount: risk.riskAmount,
    notional: risk.notional,
    futures: risk.futures,
    pattern: verdict.pattern,
    warning: risk.warning,
    confluence: verdict.confluence,
    htfTrend: verdict.htfTrend,
    htfInterval: verdict.htfInterval,
    mtfNote: verdict.mtfNote,
    btcTrend: verdict.btcTrend,
    btcAligned: verdict.btcAligned,
    btcNote: verdict.btcNote,
  };
}

export function getSideLabel(side: TradeSide): string {
  if (side === "long") return "LONG";
  if (side === "short") return "SHORT";
  return "—";
}

export function getActionLabel(verdict: Verdict): string {
  switch (verdict) {
    case "enter":
      return "Kirish";
    case "avoid":
      return "Kirish xato";
    default:
      return "Kutib turish";
  }
}

export function getRsiLabel(rsi: number): string {
  if (rsi >= 70) return "Haddan tashqari sotib olingan";
  if (rsi <= 30) return "Haddan tashqari sotilgan";
  return "Neytral";
}

export function getVerdictStyles(verdict: Verdict): {
  badge: string;
  border: string;
} {
  switch (verdict) {
    case "enter":
      return {
        badge:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-500/30",
      };
    case "avoid":
      return {
        badge: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
        border: "border-red-500/30",
      };
    default:
      return {
        badge:
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        border: "border-amber-500/30",
      };
  }
}

export function isRrGood(rr: number, marketType: MarketType = "spot"): boolean {
  return rr >= (marketType === "futures" ? 2 : 1.5);
}

export function getMarketTypeLabel(marketType: MarketType): string {
  return marketType === "futures" ? "Futures" : "Spot";
}

export function getStrategyStyles(confidence: number): string {
  if (confidence >= 70) {
    return "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300";
  }

  if (confidence >= 55) {
    return "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  }

  return "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300";
}
