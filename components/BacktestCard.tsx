import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BacktestSummary } from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BacktestCardProps {
  summary?: BacktestSummary;
  loading: boolean;
  error?: string;
}

function winRateColor(value: number): string {
  if (value >= 55) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function BacktestCard({ summary, loading, error }: BacktestCardProps) {
  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          Backtest — tarixiy natijalar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-muted-foreground">
            Tarixiy ma'lumotlar hisoblanmoqda...
          </p>
        )}

        {error && !loading && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {summary && !loading && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">Savdolar</p>
                <p className="text-lg font-semibold tabular-nums">
                  {summary.trades}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">Win rate</p>
                <p
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    winRateColor(summary.winRate),
                  )}
                >
                  {formatPercent(summary.winRate)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">O'rtacha R</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatNumber(summary.avgR)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">Kutilma (R)</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatNumber(summary.expectancy)}
                </p>
              </div>
            </div>

            {summary.byStrategy.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Strategiya
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Savdo
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Win %
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Avg R
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byStrategy.map((stat) => (
                      <tr
                        key={stat.strategy}
                        className="border-t border-border/60"
                      >
                        <td className="px-3 py-2">{stat.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {stat.trades}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            winRateColor(stat.winRate),
                          )}
                        >
                          {formatPercent(stat.winRate)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(stat.avgR)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {summary.candlesAnalyzed} ta shamdan iborat tarix tahlil qilindi.
              Backtest — taxminiy natija (keyingi shamda kirish, avval SL/TP).
              O'tgan natija kelajakni kafolatlamaydi.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
