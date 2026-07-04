import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AnalyzeRisk, Trend } from "@/lib/api";

interface RiskCardProps {
  currentPrice: number;
  trend: Trend;
  risk: AnalyzeRisk;
  riskPercent: number;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
});

function getRiskLevel(riskPercent: number): {
  label: string;
  className: string;
} {
  if (riskPercent <= 1) {
    return {
      label: "Past",
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }

  if (riskPercent <= 3) {
    return {
      label: "O'rta",
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    };
  }

  return {
    label: "Yuqori",
    className:
      "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  };
}

function getTrendBadge(trend: Trend): { label: string; className: string } {
  switch (trend) {
    case "bullish":
      return {
        label: "Bullish",
        className:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      };
    case "bearish":
      return {
        label: "Bearish",
        className:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
      };
    default:
      return {
        label: "Neutral",
        className:
          "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
      };
  }
}

function MetricRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "green" | "red" | "blue";
}) {
  const highlightClass =
    highlight === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : highlight === "red"
        ? "text-red-600 dark:text-red-400"
        : highlight === "blue"
          ? "text-blue-600 dark:text-blue-400"
          : "";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${highlightClass}`}>
        {value}
      </span>
    </div>
  );
}

export function RiskCard({
  currentPrice,
  trend,
  risk,
  riskPercent,
}: RiskCardProps) {
  const riskLevel = getRiskLevel(riskPercent);
  const trendBadge = getTrendBadge(trend);

  return (
    <Card className="h-full border-border/60 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Risk va narx</CardTitle>
            <CardDescription>Stop-loss va take-profit darajalari</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={riskLevel.className}>{riskLevel.label} risk</Badge>
            <Badge className={trendBadge.className}>{trendBadge.label}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <MetricRow
          label="Joriy narx"
          value={currencyFormatter.format(currentPrice)}
          highlight="blue"
        />
        <MetricRow
          label="Stop-loss"
          value={currencyFormatter.format(risk.stopLoss)}
          highlight="red"
        />
        <MetricRow
          label="Take-profit"
          value={currencyFormatter.format(risk.takeProfit)}
          highlight="green"
        />
        <MetricRow
          label="Position size"
          value={numberFormatter.format(risk.positionSize)}
        />
        <MetricRow
          label="Risk/Reward"
          value={`1 : ${risk.riskRewardRatio.toFixed(2)}`}
        />

        {risk.warning && (
          <Alert className="mt-4 border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="text-amber-600 dark:text-amber-400" />
            <AlertTitle>Ogohlantirish</AlertTitle>
            <AlertDescription>{risk.warning}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
