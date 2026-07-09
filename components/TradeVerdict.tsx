import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Bitcoin,
  CandlestickChart,
  Check,
  Clock,
  Gauge,
  Layers,
  TrendingUp,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyzeResponse } from "@/lib/api";
import { formatPrice, formatNumber, formatUsd } from "@/lib/format";
import {
  buildTradeVerdict,
  getMarketTypeLabel,
  getRsiLabel,
  getSideLabel,
  getStrategyStyles,
  getVerdictStyles,
  getActionLabel,
  isRrGood,
} from "@/lib/setup";

const verdictIcons = {
  enter: TrendingUp,
  wait: Clock,
  avoid: Ban,
} as const;

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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function ConfluenceBar({ value }: { value: number }) {
  const color =
    value >= 70
      ? "bg-emerald-500"
      : value >= 45
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function TradeVerdict({ result }: { result: AnalyzeResponse }) {
  const verdict = buildTradeVerdict(result);
  const styles = getVerdictStyles(verdict.verdict);
  const Icon = verdictIcons[verdict.verdict];
  const SideIcon = verdict.side === "short" ? ArrowDownRight : ArrowUpRight;

  return (
    <Card className={`border ${styles.border}`}>
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
              {getActionLabel(verdict.verdict)}
            </Badge>
            {verdict.side && (
              <Badge variant="outline" className="gap-1 text-xs">
                <SideIcon className="size-3" />
                {getSideLabel(verdict.side)}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`text-xs ${getStrategyStyles(verdict.strategyConfidence)}`}
            >
              {verdict.strategyLabel} · {verdict.strategyConfidence}%
            </Badge>
            <Badge variant="outline" className="text-xs">
              {getMarketTypeLabel(verdict.marketType)}
            </Badge>
            {verdict.pattern && (
              <Badge
                variant="outline"
                className={`gap-1 text-xs ${
                  verdict.pattern.direction === "bullish"
                    ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                    : "border-red-500/40 text-red-600 dark:text-red-400"
                }`}
              >
                <CandlestickChart className="size-3" />
                {verdict.pattern.label}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {verdict.confluence !== undefined && (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Layers className="size-3.5" />
                Multi-timeframe confluence
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {verdict.confluence}%
              </span>
            </div>
            <ConfluenceBar value={verdict.confluence} />
            {verdict.mtfNote && (
              <p className="mt-2 text-xs text-muted-foreground">
                {verdict.mtfNote}
              </p>
            )}
          </div>
        )}

        {verdict.btcTrend && verdict.btcNote && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs ${
              verdict.btcAligned === false
                ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                : "border-border/60 bg-muted/20 text-muted-foreground"
            }`}
          >
            <Bitcoin className="size-4 shrink-0" />
            <span className="font-medium">BTC bozor rejimi:</span>
            <span>{verdict.btcNote}</span>
          </div>
        )}

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
              label="Stop-loss"
              value={formatPrice(verdict.stopLoss)}
              accent="red"
            />
            <LevelRow
              label="Take-profit"
              value={formatPrice(verdict.takeProfit)}
              accent="green"
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-1">
            <LevelRow
              label="Pozitsiya hajmi"
              value={`${formatNumber(verdict.positionSize, 4)} birlik (${formatUsd(verdict.notional)})`}
            />
            <LevelRow
              label="Riskdagi pul"
              value={formatUsd(verdict.riskAmount)}
              accent="amber"
            />
            <LevelRow
              label="R:R hozir"
              value={`1:${verdict.rrNow.toFixed(1)}`}
              accent={isRrGood(verdict.rrNow, verdict.marketType) ? "green" : "red"}
            />
            <LevelRow
              label="R:R kutilgan"
              value={`1:${verdict.rrIdeal.toFixed(1)}`}
              accent={
                isRrGood(verdict.rrIdeal, verdict.marketType) ? "green" : "amber"
              }
            />
            <LevelRow label="Trend" value={verdict.trend.toUpperCase()} />
          </div>
        </div>

        {verdict.futures && (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Gauge className="size-3.5" />
              Futures leverage tavsiyasi
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Metric
                label="Tavsiya"
                value={`${verdict.futures.suggestedLeverage}x`}
              />
              <Metric
                label="Maksimum xavfsiz"
                value={`${verdict.futures.maxSafeLeverage}x`}
              />
              <Metric
                label="Kerakli margin"
                value={formatUsd(verdict.futures.requiredMargin)}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {verdict.futures.note}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric
            label="RSI"
            value={`${verdict.indicators.rsi.toFixed(0)} · ${getRsiLabel(verdict.indicators.rsi)}`}
          />
          <Metric label="ATR" value={formatPrice(verdict.indicators.atr)} />
          <Metric
            label="Hajm"
            value={verdict.indicators.volumeStatus.toUpperCase()}
          />
          <Metric
            label="EMA 50"
            value={formatPrice(verdict.indicators.ema50)}
          />
          <Metric
            label="EMA 200"
            value={formatPrice(verdict.indicators.ema200)}
          />
          <Metric
            label="Support / Rezistans"
            value={`${formatPrice(verdict.indicators.support)} / ${formatPrice(verdict.indicators.resistance)}`}
          />
        </div>

        {verdict.warning && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{verdict.warning}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
