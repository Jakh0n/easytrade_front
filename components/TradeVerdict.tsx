import { AlertTriangle, Ban, Check, Clock, TrendingUp, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyzeResponse } from "@/lib/api";
import {
  buildTradeVerdict,
  formatPrice,
  getMarketTypeLabel,
  getStrategyStyles,
  getVerdictStyles,
  isRrGood,
} from "@/lib/setup";

interface TradeVerdictProps {
  result: AnalyzeResponse;
}

const verdictIcons = {
  enter: TrendingUp,
  wait: Clock,
  avoid: Ban,
};

function LevelRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "red" | "green" | "amber" | "default";
}) {
  const accentClass =
    accent === "red"
      ? "text-red-600 dark:text-red-400"
      : accent === "green"
        ? "text-emerald-600 dark:text-emerald-400"
        : accent === "amber"
          ? "text-amber-600 dark:text-amber-400"
          : "";

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${accentClass}`}>
        {value}
      </span>
    </div>
  );
}

export function TradeVerdict({ result }: TradeVerdictProps) {
  const verdict = buildTradeVerdict(result);
  const styles = getVerdictStyles(verdict.verdict);
  const Icon = verdictIcons[verdict.verdict];

  return (
    <Card className={`border shadow-sm ${styles.border}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icon className="size-5" />
              {verdict.symbol} — {verdict.headline}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{verdict.reason}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={`text-sm ${styles.badge}`}>
              {verdict.verdictLabel}
            </Badge>
            <Badge
              variant="outline"
              className={`text-xs ${getStrategyStyles(verdict.strategyConfidence)}`}
            >
              {verdict.strategyLabel} · {verdict.strategyConfidence}%
            </Badge>
            <Badge variant="outline" className="text-xs">
              {getMarketTypeLabel(verdict.marketType)}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {verdict.strategyDescription}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Strategiya checklist
          </p>
          <ul className="space-y-1.5">
            {verdict.checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                {item.passed ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <span>
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    — {item.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-1">
            <LevelRow
              label="Joriy narx"
              value={formatPrice(verdict.currentPrice)}
            />
            <LevelRow
              label="Kirish zonasi"
              value={`${formatPrice(verdict.entryZone[0])} – ${formatPrice(verdict.entryZone[1])}`}
              accent="green"
            />
            <LevelRow
              label="Invalidation"
              value={formatPrice(verdict.invalidation)}
              accent="amber"
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-1">
            <LevelRow
              label="Stop-loss"
              value={formatPrice(verdict.stopLoss)}
              accent="red"
            />
            <LevelRow
              label="Take-profit"
              value={formatPrice(verdict.takeProfit)}
              accent="green"
            />
            <LevelRow label="Trend" value={verdict.trend.toUpperCase()} />
          </div>
        </div>

        <div className="flex flex-wrap gap-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
          <div>
            <span className="text-muted-foreground">R:R hozir: </span>
            <span
              className={`font-semibold tabular-nums ${isRrGood(verdict.rrNow) ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            >
              1:{verdict.rrNow.toFixed(1)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">R:R kutib: </span>
            <span
              className={`font-semibold tabular-nums ${isRrGood(verdict.rrIdeal) ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
            >
              1:{verdict.rrIdeal.toFixed(1)}
            </span>
          </div>
        </div>

        {verdict.verdict === "avoid" && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Setup zaif — {formatPrice(verdict.invalidation)} pastida yopilish
              setupni bekor qiladi.
            </span>
          </div>
        )}

        {verdict.verdict === "wait" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <Clock className="mt-0.5 size-4 shrink-0" />
            <span>
              Hozir kirish erta. {formatPrice(verdict.entryZone[0])} –{" "}
              {formatPrice(verdict.entryZone[1])} zonasiga kelganda qayta
              baholang.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
