"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EmaSmcAnalysis } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import {
  getEmaSmcScoreColor,
  getEmaSmcVerdictStyles,
} from "@/lib/strategies";
import { cn } from "@/lib/utils";

interface StrategyAnalysisCardProps {
  analysis: EmaSmcAnalysis;
}

export function StrategyAnalysisCard({ analysis }: StrategyAnalysisCardProps) {
  const styles = getEmaSmcVerdictStyles(analysis.verdict);

  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{analysis.symbol}</h2>
        <Badge className={styles.badge}>{analysis.verdictLabel}</Badge>
        {analysis.side && (
          <Badge
            variant="outline"
            className={
              analysis.side === "long"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }
          >
            {analysis.side === "long" ? "LONG" : "SHORT"}
          </Badge>
        )}
        <Badge
          variant="outline"
          className={cn("tabular-nums", getEmaSmcScoreColor(analysis.score))}
        >
          {analysis.score}/100
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">{analysis.reason}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="EMA 200 (4H)" value={formatPrice(analysis.ema200)} />
        <Stat label="Narx" value={formatPrice(analysis.currentPrice)} />
        <Stat label="Stop Loss" value={formatPrice(analysis.stopLoss)} />
        <Stat label="Take Profit" value={formatPrice(analysis.takeProfit)} />
        <Stat label="R:R" value={`1:${analysis.riskReward.toFixed(1)}`} />
        <Stat label="PDH" value={formatPrice(analysis.keyLevels.pdh)} />
        <Stat label="PDL" value={formatPrice(analysis.keyLevels.pdl)} />
        {analysis.entryZone && (
          <Stat
            label={`Kirish (${analysis.entryType?.toUpperCase() ?? ""})`}
            value={`${formatPrice(analysis.entryZone[0])} – ${formatPrice(analysis.entryZone[1])}`}
          />
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Trading Checklist</h3>
        <ul className="space-y-1.5">
          {analysis.checklist.map((item) => (
            <li
              key={item.label}
              className="flex items-start gap-2 text-sm"
            >
              {item.passed ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <div>
                <span className={item.passed ? "font-medium" : "text-muted-foreground"}>
                  {item.label}
                </span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  — {item.detail}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
