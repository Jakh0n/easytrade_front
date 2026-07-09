"use client";

import { Loader2, PiggyBank, RefreshCw, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInvestScreener } from "@/hooks/useMarket";
import { useAddWatchlist } from "@/hooks/useWatchlist";
import { ApiError, type InvestHorizon, type InvestScreenerCoin } from "@/lib/api";
import { formatDate, formatPercent, formatPrice } from "@/lib/format";
import {
  getInvestActionLabel,
  getInvestVerdictStyles,
  getScoreColor,
  HORIZON_OPTIONS,
} from "@/lib/invest";
import { cn } from "@/lib/utils";

type SortKey = "opportunity" | "score" | "upside" | "discount";

const SORTERS: Record<
  SortKey,
  (a: InvestScreenerCoin, b: InvestScreenerCoin) => number
> = {
  opportunity: (a, b) => b.opportunityScore - a.opportunityScore,
  score: (a, b) => b.score - a.score,
  upside: (a, b) => b.topTargetUpside - a.topTargetUpside,
  discount: (a, b) => b.drawdownFromHigh - a.drawdownFromHigh,
};

interface InvestOpportunitiesProps {
  horizon: InvestHorizon;
  onHorizonChange: (horizon: InvestHorizon) => void;
  onSelect: (symbol: string) => void;
}

export function InvestOpportunities({
  horizon,
  onHorizonChange,
  onSelect,
}: InvestOpportunitiesProps) {
  const screener = useInvestScreener(horizon, 15);
  const addWatchlist = useAddWatchlist();
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");

  const coins = useMemo(() => {
    const list = screener.data?.coins ?? [];
    return [...list].sort(SORTERS[sortKey]);
  }, [screener.data, sortKey]);

  const handleWatch = (coin: InvestScreenerCoin) => {
    addWatchlist.mutate(
      { symbol: coin.symbol, marketType: "spot" },
      {
        onSuccess: () => toast.success(`${coin.symbol} watchlist'ga qo'shildi`),
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Xato yuz berdi",
          ),
      },
    );
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <PiggyBank className="size-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Eng yaxshi uzoq muddat imkoniyatlari</h2>
            <p className="text-xs text-muted-foreground">
              Likvid spot coinlar — ball ≥45, tavsiya etilmaydiganlar filtrlangan
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={horizon}
            onValueChange={(value) => onHorizonChange(value as InvestHorizon)}
          >
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORIZON_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sortKey}
            onValueChange={(value) => setSortKey(value as SortKey)}
          >
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opportunity">Eng kuchli imkoniyat</SelectItem>
              <SelectItem value="score">Ball bo&apos;yicha</SelectItem>
              <SelectItem value="upside">Maqsad upside</SelectItem>
              <SelectItem value="discount">Chegirma bo&apos;yicha</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            disabled={screener.isFetching}
            onClick={() => screener.refetch()}
          >
            {screener.isFetching ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Yangilash
          </Button>
        </div>
      </div>

      {screener.isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Uzoq muddat imkoniyatlari skanerlanmoqda...
        </div>
      )}

      {screener.error && !screener.isLoading && (
        <p className="px-4 py-6 text-center text-sm text-destructive">
          {screener.error instanceof ApiError
            ? screener.error.message
            : "Skaner xatosi"}
        </p>
      )}

      {!screener.isLoading && coins.length === 0 && !screener.error && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Hozircha mos uzoq muddat setup topilmadi. Muddatni o&apos;zgartiring yoki
          keyinroq qayta urinib ko&apos;ring.
        </p>
      )}

      {coins.length > 0 && (
        <div className="divide-y divide-border/50">
          {coins.map((coin) => {
            const styles = getInvestVerdictStyles(coin.verdict);
            const changeColor =
              coin.priceChangePercent >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400";

            return (
              <div
                key={coin.symbol}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/30"
              >
                <button
                  type="button"
                  onClick={() => onSelect(coin.symbol)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {coin.symbol.replace("USDT", "")}
                      </span>
                      <Badge className={`text-xs ${styles.badge}`}>
                        {getInvestActionLabel(coin.verdict)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs tabular-nums",
                          getScoreColor(coin.score),
                        )}
                      >
                        {coin.score}/100
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {coin.trend.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {coin.reason}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right text-sm tabular-nums sm:block">
                    <p>{formatPrice(coin.currentPrice)}</p>
                    <p className={`text-xs ${changeColor}`}>
                      {coin.priceChangePercent >= 0 ? "+" : ""}
                      {coin.priceChangePercent.toFixed(2)}%
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right text-sm sm:block">
                    <p className="text-xs text-muted-foreground">Chegirma</p>
                    <p className="font-medium tabular-nums">
                      −{formatPercent(coin.drawdownFromHigh)}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right text-sm md:block">
                    <p className="text-xs text-muted-foreground">Maqsad</p>
                    <p className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{formatPercent(coin.topTargetUpside)}
                    </p>
                  </div>
                </button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Watchlist'ga qo'shish"
                  className="shrink-0"
                  onClick={() => handleWatch(coin)}
                >
                  <Star className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {screener.data && !screener.isLoading && (
        <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          {screener.data.scanned} ta juftlik skanerlandi · {coins.length} ta
          imkoniyat · BTC {screener.data.btcTrend} · yangilandi:{" "}
          {formatDate(screener.data.updatedAt)}
        </p>
      )}
    </section>
  );
}
