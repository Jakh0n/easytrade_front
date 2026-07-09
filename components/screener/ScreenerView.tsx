"use client";

import { Loader2, RefreshCw, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScreener } from "@/hooks/useMarket";
import { useAddWatchlist } from "@/hooks/useWatchlist";
import { ApiError, type MarketType, type ScreenerCoin } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import { getStrategyStyles, getVerdictStyles, getActionLabel } from "@/lib/setup";

type SortKey = "opportunity" | "confidence" | "rr" | "change" | "volume";
type SideFilter = "all" | "long" | "short";

const SORTERS: Record<SortKey, (a: ScreenerCoin, b: ScreenerCoin) => number> = {
  opportunity: (a, b) => b.opportunityScore - a.opportunityScore,
  confidence: (a, b) => b.strategy.confidence - a.strategy.confidence,
  rr: (a, b) => b.rrNow - a.rrNow,
  change: (a, b) => b.priceChangePercent - a.priceChangePercent,
  volume: (a, b) => b.quoteVolume - a.quoteVolume,
};

const VOLUME_LABELS: Record<ScreenerCoin["volumeStatus"], string> = {
  high: "Kuchli volume",
  normal: "O'rtacha volume",
  low: "Past volume",
};

function VolumeBadge({ status }: { status: ScreenerCoin["volumeStatus"] }) {
  const styles =
    status === "high"
      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
      : status === "low"
        ? "text-muted-foreground"
        : "text-amber-600 dark:text-amber-400 border-amber-500/40";
  return (
    <Badge variant="outline" className={`text-xs ${styles}`}>
      {VOLUME_LABELS[status]}
    </Badge>
  );
}

function SideBadge({ side }: { side: ScreenerCoin["side"] }) {
  if (!side) return null;
  const isLong = side === "long";
  return (
    <Badge
      variant="outline"
      className={
        isLong
          ? "text-xs text-emerald-600 dark:text-emerald-400"
          : "text-xs text-red-600 dark:text-red-400"
      }
    >
      {isLong ? "LONG" : "SHORT"}
    </Badge>
  );
}

export function ScreenerView() {
  const [marketType, setMarketType] = useState<MarketType>("spot");
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");

  const screener = useScreener(marketType, "4h", 20);
  const addWatchlist = useAddWatchlist();

  const coins = useMemo(() => {
    const list = screener.data?.coins ?? [];
    const filtered =
      sideFilter === "all"
        ? list
        : list.filter((coin) => coin.side === sideFilter);
    return [...filtered].sort(SORTERS[sortKey]);
  }, [screener.data, sideFilter, sortKey]);

  const handleWatch = (coin: ScreenerCoin) => {
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
    <div>
      <PageHeader
        title="Bozor skaneri"
        description="Butun bozor bo'ylab faol kirish signallari"
        action={
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
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          value={marketType}
          onValueChange={(v) => setMarketType(v as MarketType)}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="spot">Spot</SelectItem>
            <SelectItem value="futures">Futures</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sideFilter} onValueChange={(v) => setSideFilter(v as SideFilter)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Barcha yo'nalish</SelectItem>
            <SelectItem value="long">Faqat LONG</SelectItem>
            <SelectItem value="short">Faqat SHORT</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="opportunity">Eng kuchli imkoniyat</SelectItem>
            <SelectItem value="volume">Volume bo'yicha</SelectItem>
            <SelectItem value="confidence">Ishonch bo'yicha</SelectItem>
            <SelectItem value="rr">R:R bo'yicha</SelectItem>
            <SelectItem value="change">O'zgarish bo'yicha</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {screener.isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Butun bozor skanerlanmoqda...
        </div>
      )}

      {screener.error && !screener.isLoading && (
        <p className="py-6 text-center text-sm text-destructive">
          {screener.error instanceof ApiError
            ? screener.error.message
            : "Skaner xatosi"}
        </p>
      )}

      {!screener.isLoading && coins.length === 0 && !screener.error && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Hozircha kirish signali yo&apos;q.
        </p>
      )}

      {coins.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border/60">
          {coins.map((coin) => {
            const styles = getVerdictStyles(coin.verdict);
            const changeColor =
              coin.priceChangePercent >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400";
            return (
              <div
                key={coin.symbol}
                className="flex items-center gap-3 border-b border-border/50 px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/30"
              >
                <Link
                  href={`/analyze?symbol=${coin.symbol}&marketType=${marketType}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {coin.symbol.replace("USDT", "")}
                      </span>
                      <Badge className={`text-xs ${styles.badge}`}>
                        {getActionLabel(coin.verdict)}
                      </Badge>
                      <SideBadge side={coin.side} />
                      <Badge
                        variant="outline"
                        className={`text-xs ${getStrategyStyles(coin.strategy.confidence)}`}
                      >
                        {coin.strategy.label} · {coin.strategy.confidence}%
                      </Badge>
                      <VolumeBadge status={coin.volumeStatus} />
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
                    <p className="text-xs text-muted-foreground">R:R hozir</p>
                    <p className="font-medium tabular-nums">
                      1:{coin.rrNow.toFixed(1)}
                    </p>
                  </div>
                </Link>

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
        <p className="mt-3 text-xs text-muted-foreground">
          {screener.data.scanned} ta juftlik skanerlandi · {coins.length} ta
          signal · yangilandi: {formatDate(screener.data.updatedAt)}
        </p>
      )}
    </div>
  );
}
