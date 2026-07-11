"use client";

import { Loader2, RefreshCw, Star } from "lucide-react";
import Link from "next/link";
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
import { useStrategyScreener } from "@/hooks/useMarket";
import { useAddWatchlist } from "@/hooks/useWatchlist";
import {
  ApiError,
  type CustomStrategyId,
  type EmaSmcScreenerCoin,
  type MarketType,
} from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import {
  getEmaSmcScoreColor,
  getEmaSmcVerdictStyles,
} from "@/lib/strategies";
import { cn } from "@/lib/utils";

type SortKey = "opportunity" | "score" | "rr" | "change" | "volume";
type SideFilter = "all" | "long" | "short";
type VerdictFilter = "all" | "enter" | "wait";

const SORTERS: Record<
  SortKey,
  (a: EmaSmcScreenerCoin, b: EmaSmcScreenerCoin) => number
> = {
  opportunity: (a, b) => b.opportunityScore - a.opportunityScore,
  score: (a, b) => b.score - a.score,
  rr: (a, b) => b.riskReward - a.riskReward,
  change: (a, b) => b.priceChangePercent - a.priceChangePercent,
  volume: (a, b) => b.quoteVolume - a.quoteVolume,
};

interface StrategyCoinListProps {
  strategyId: CustomStrategyId;
  onSelect?: (symbol: string) => void;
}

export function StrategyCoinList({
  strategyId,
  onSelect,
}: StrategyCoinListProps) {
  const [marketType, setMarketType] = useState<MarketType>("futures");
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");

  const screener = useStrategyScreener(strategyId, marketType, 15);
  const addWatchlist = useAddWatchlist();

  const coins = useMemo(() => {
    let list = screener.data?.coins ?? [];
    if (sideFilter !== "all") {
      list = list.filter((c) => c.side === sideFilter);
    }
    if (verdictFilter !== "all") {
      list = list.filter((c) => c.verdict === verdictFilter);
    }
    return [...list].sort(SORTERS[sortKey]);
  }, [screener.data, sideFilter, verdictFilter, sortKey]);

  const handleWatch = (coin: EmaSmcScreenerCoin) => {
    addWatchlist.mutate(
      { symbol: coin.symbol, marketType },
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
        <div>
          <h2 className="text-sm font-semibold">Strategiya bo&apos;yicha coinlar</h2>
          <p className="text-xs text-muted-foreground">
            EMA 200 + SMC shartlariga mos setuplar
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={marketType}
            onValueChange={(v) => setMarketType(v as MarketType)}
          >
            <SelectTrigger size="sm" className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="futures">Futures</SelectItem>
              <SelectItem value="spot">Spot</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={verdictFilter}
            onValueChange={(v) => setVerdictFilter(v as VerdictFilter)}
          >
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha holat</SelectItem>
              <SelectItem value="enter">Kirish</SelectItem>
              <SelectItem value="wait">Kutish</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sideFilter}
            onValueChange={(v) => setSideFilter(v as SideFilter)}
          >
            <SelectTrigger size="sm" className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha yo&apos;nalish</SelectItem>
              <SelectItem value="long">Faqat LONG</SelectItem>
              <SelectItem value="short">Faqat SHORT</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <SelectTrigger size="sm" className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opportunity">Eng kuchli</SelectItem>
              <SelectItem value="score">Ball bo&apos;yicha</SelectItem>
              <SelectItem value="rr">R:R bo&apos;yicha</SelectItem>
              <SelectItem value="volume">Volume</SelectItem>
              <SelectItem value="change">O&apos;zgarish</SelectItem>
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
          Strategiya bo&apos;yicha coinlar skanerlanmoqda...
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
          Hozircha ushbu strategiya bo&apos;yicha mos setup topilmadi. Keyinroq
          qayta urinib ko&apos;ring.
        </p>
      )}

      {coins.length > 0 && (
        <div className="divide-y divide-border/50">
          {coins.map((coin) => {
            const styles = getEmaSmcVerdictStyles(coin.verdict);
            const changeColor =
              coin.priceChangePercent >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400";

            const rowContent = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {coin.symbol.replace("USDT", "")}
                    </span>
                    <Badge className={`text-xs ${styles.badge}`}>
                      {coin.verdictLabel}
                    </Badge>
                    {coin.side && (
                      <Badge
                        variant="outline"
                        className={
                          coin.side === "long"
                            ? "text-xs text-emerald-600 dark:text-emerald-400"
                            : "text-xs text-red-600 dark:text-red-400"
                        }
                      >
                        {coin.side === "long" ? "LONG" : "SHORT"}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={cn("text-xs tabular-nums", getEmaSmcScoreColor(coin.score))}
                    >
                      {coin.score}/100
                    </Badge>
                    {coin.sweep && (
                      <Badge variant="outline" className="text-xs">
                        Sweep · {coin.sweep.levelType.toUpperCase()}
                      </Badge>
                    )}
                    {coin.structure && (
                      <Badge variant="outline" className="text-xs">
                        {coin.structure.type.toUpperCase()}
                      </Badge>
                    )}
                    {coin.entryType && (
                      <Badge variant="outline" className="text-xs">
                        {coin.entryType.toUpperCase()}
                      </Badge>
                    )}
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
                  <p className="text-xs text-muted-foreground">R:R</p>
                  <p className="font-medium tabular-nums">
                    1:{coin.riskReward.toFixed(1)}
                  </p>
                </div>
              </>
            );

            return (
              <div
                key={coin.symbol}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/30"
              >
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(coin.symbol)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {rowContent}
                  </button>
                ) : (
                  <Link
                    href={`/strategies/${strategyId}?symbol=${coin.symbol}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    {rowContent}
                  </Link>
                )}

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
          mos setup · yangilandi: {formatDate(screener.data.updatedAt)}
        </p>
      )}
    </section>
  );
}
