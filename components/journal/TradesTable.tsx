"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCloseTrade, useDeleteTrade } from "@/hooks/useJournal";
import type { Trade } from "@/lib/api";
import { formatNumber, formatPrice, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

function pnlColor(value?: number): string {
  if (value === undefined) return "";
  return value >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}

export function TradesTable({ trades }: { trades: Trade[] }) {
  const closeTrade = useCloseTrade();
  const deleteTrade = useDeleteTrade();

  const handleClose = (trade: Trade) => {
    const input = window.prompt(
      `${trade.symbol} — chiqish narxini kiriting`,
      String(trade.takeProfit),
    );
    if (!input) return;
    const exitPrice = Number(input);
    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      toast.error("Noto'g'ri narx");
      return;
    }
    closeTrade.mutate(
      { id: trade._id, exitPrice },
      { onSuccess: () => toast.success("Savdo yopildi") },
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Coin</th>
            <th className="px-3 py-2 text-left font-medium">Yo&apos;nalish</th>
            <th className="px-3 py-2 text-right font-medium">Kirish</th>
            <th className="px-3 py-2 text-right font-medium">SL / TP</th>
            <th className="px-3 py-2 text-right font-medium">R</th>
            <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
            <th className="px-3 py-2 text-right font-medium">Amal</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade._id} className="border-t border-border/60">
              <td className="px-3 py-2 font-medium">{trade.symbol}</td>
              <td className="px-3 py-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    trade.side === "long"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {trade.side.toUpperCase()}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatPrice(trade.entryPrice)}
              </td>
              <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                {formatPrice(trade.stopLoss)} / {formatPrice(trade.takeProfit)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {trade.rMultiple !== undefined
                  ? formatNumber(trade.rMultiple)
                  : "—"}
              </td>
              <td
                className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  pnlColor(trade.pnl),
                )}
              >
                {trade.pnl !== undefined ? formatUsd(trade.pnl) : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  {trade.status === "open" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClose(trade)}
                    >
                      Yopish
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Yopilgan
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="O'chirish"
                    onClick={() =>
                      deleteTrade.mutate(trade._id, {
                        onSuccess: () => toast.success("O'chirildi"),
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
