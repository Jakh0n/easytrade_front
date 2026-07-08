import type {
  AnalyzeResponse,
  MarketType,
  StrategyChecklistItem,
  TradeSide,
  Trend,
  Verdict,
} from "@/lib/api";

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
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function buildTradeVerdict(result: AnalyzeResponse): TradeVerdictData {
  const { verdict, strategy, risk, currentPrice, trend, symbol, marketType } =
    result;

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
  };
}

export function formatPrice(value: number): string {
  return currencyFormatter.format(value);
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

export function isRrGood(rr: number): boolean {
  return rr >= 1.5;
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
