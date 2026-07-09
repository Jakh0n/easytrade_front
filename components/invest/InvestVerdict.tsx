import {
  Ban,
  Bitcoin,
  Check,
  Clock,
  PiggyBank,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvestAnalysis } from "@/lib/api";
import { formatDate, formatNumber, formatPercent, formatPrice } from "@/lib/format";
import {
  getInvestActionLabel,
  getInvestVerdictStyles,
  getScoreColor,
} from "@/lib/invest";
import { cn } from "@/lib/utils";

const verdictIcons = {
  accumulate: PiggyBank,
  dca_wait: Clock,
  avoid: Ban,
} as const;

function ScoreBar({ value }: { value: number }) {
  const color =
    value >= 70
      ? "bg-emerald-500"
      : value >= 45
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${value}%` }}
      />
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

export function InvestVerdict({ result }: { result: InvestAnalysis }) {
  const styles = getInvestVerdictStyles(result.verdict);
  const Icon = verdictIcons[result.verdict];
  const passedCount = result.checklist.filter((item) => item.passed).length;

  return (
    <Card className={`border ${styles.border}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icon className="size-5" />
              {result.symbol} — {result.horizonLabel} investitsiya
            </CardTitle>
            <p className="text-sm text-muted-foreground">{result.reason}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={`text-sm ${styles.badge}`}>
              {getInvestActionLabel(result.verdict)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Spot · hold
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-xs tabular-nums", getScoreColor(result.score))}
            >
              Ball: {result.score}/100
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Investitsiya balli
            </span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                getScoreColor(result.score),
              )}
            >
              {result.score}/100
            </span>
          </div>
          <ScoreBar value={result.score} />
          <p className="mt-2 text-xs text-muted-foreground">
            {passedCount}/{result.checklist.length} shart bajarildi ·{" "}
            {result.horizonLabel} uchun DCA rejasi
          </p>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs",
            result.btcTrend === "bearish"
              ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
              : "border-border/60 bg-muted/20 text-muted-foreground",
          )}
        >
          <Bitcoin className="size-4 shrink-0" />
          <span className="font-medium">BTC bozor rejimi:</span>
          <span>{result.btcTrend.toUpperCase()}</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Investitsiya checklist
          </p>
          <ul className="space-y-1.5">
            {result.checklist.map((item) => (
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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Joriy narx" value={formatPrice(result.currentPrice)} />
          <Metric
            label="52 hafta cho'qqi"
            value={formatPrice(result.high52w)}
          />
          <Metric label="52 hafta tub" value={formatPrice(result.low52w)} />
          <Metric
            label="Cho'qqidan tushish"
            value={`−${formatPercent(result.drawdownFromHigh)}`}
          />
          <Metric
            label="Haftalik RSI"
            value={result.weeklyRsi.toFixed(0)}
          />
          <Metric label="Makro trend" value={result.trend.toUpperCase()} />
          <Metric
            label="O'rtacha kirish"
            value={formatPrice(result.averageEntry)}
          />
          <Metric
            label="Maks. zarar"
            value={`−${formatPercent(result.maxLossPercent)}`}
          />
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <PiggyBank className="size-3.5" />
            DCA rejasi — 3 bosqich (40% / 30% / 30%)
          </p>
          <div className="overflow-hidden rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Bosqich</th>
                  <th className="px-3 py-2 text-right font-medium">Narx</th>
                  <th className="px-3 py-2 text-right font-medium">Ulush</th>
                  <th className="px-3 py-2 text-right font-medium">Summa</th>
                  <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">
                    Izoh
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.dcaPlan.map((tranche) => (
                  <tr
                    key={tranche.label}
                    className="border-t border-border/60"
                  >
                    <td className="px-3 py-2 font-medium">{tranche.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatPrice(tranche.price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {tranche.allocationPercent}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      ${formatNumber(tranche.amountUsd, 2)}
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                      {tranche.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {result.targets.length > 0 && (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Target className="size-3.5" />
              Maqsadlar — {result.horizonLabel}
            </p>
            <div className="space-y-2">
              {result.targets.map((target) => (
                <div
                  key={target.label}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-2"
                >
                  <span className="text-sm font-medium">{target.label}</span>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatPrice(target.price)}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      +{formatPercent(target.upsidePercent)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
              Invalidation (sotish signali)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
              {formatPrice(result.invalidation)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Narx shu daraja ostiga tushsa — investitsiya tezisi bekor, kapital
              chiqarib oling
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="size-3.5" />
              Support zonalari (haftalik)
            </p>
            {result.supportZones.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {result.supportZones.map((zone, index) => (
                  <li
                    key={zone}
                    className="text-sm tabular-nums text-emerald-600 dark:text-emerald-400"
                  >
                    {index + 1}. {formatPrice(zone)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Aniq support topilmadi — DCA darajalari taxminiy
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Yangilandi: {formatDate(result.generatedAt)} · Spot hold tahlili —
          futures/leverage qo&apos;llanmaydi. Bu moliyaviy maslahat emas.
        </p>
      </CardContent>
    </Card>
  );
}
