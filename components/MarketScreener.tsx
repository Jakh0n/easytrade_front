"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchMarketScreener,
  type MarketType,
  type ScreenerCoin,
} from "@/lib/api";
import { getStrategyStyles, getVerdictStyles } from "@/lib/setup";

interface MarketScreenerProps {
  marketType: MarketType;
  onSelectSymbol: (symbol: string) => void;
}

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

function ScreenerRow({
  coin,
  onSelect,
}: {
  coin: ScreenerCoin;
  onSelect: (symbol: string) => void;
}) {
  const styles = getVerdictStyles(coin.verdict);
  const changeColor =
    coin.priceChangePercent >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <button
      type="button"
      onClick={() => onSelect(coin.symbol)}
      className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border/60 hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{coin.symbol.replace("USDT", "")}</span>
          <Badge className={`text-xs ${styles.badge}`}>
            {coin.verdictLabel}
          </Badge>
          <Badge
            variant="outline"
            className={`text-xs ${getStrategyStyles(coin.strategy.confidence)}`}
          >
            {coin.strategy.label}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">{coin.reason}</p>
      </div>
      <div className="shrink-0 text-right text-sm tabular-nums">
        <p>{priceFormatter.format(coin.currentPrice)}</p>
        <p className={`text-xs ${changeColor}`}>
          {coin.priceChangePercent >= 0 ? "+" : ""}
          {coin.priceChangePercent.toFixed(2)}%
        </p>
      </div>
      <div className="hidden shrink-0 text-right text-sm sm:block">
        <p className="text-muted-foreground">R:R</p>
        <p className="font-medium tabular-nums">1:{coin.rrIdeal.toFixed(1)}</p>
      </div>
    </button>
  );
}

export function MarketScreener({
  marketType,
  onSelectSymbol,
}: MarketScreenerProps) {
  const [coins, setCoins] = useState<ScreenerCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    scanned: number;
    updatedAt: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchMarketScreener(marketType, "4h", 20);
      setCoins(data.coins);
      setMeta({ scanned: data.scanned, updatedAt: data.updatedAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screener xatosi");
      setCoins([]);
    } finally {
      setLoading(false);
    }
  }, [marketType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Bozor skaneri</CardTitle>
            <CardDescription>
              Butun {marketType === "futures" ? "Futures" : "Spot"} bozor —
              faqat kirish signali (LONG/SHORT)
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Yangilash
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading && coins.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Butun bozor skanerlanmoqda (bir necha daqiqa)...
          </div>
        )}

        {error && (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && coins.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Hozir kirish signali yo&apos;q. Keyinroq qayta urinib ko&apos;ring.
          </p>
        )}

        {coins.length > 0 && (
          <div className="divide-y divide-border/50">
            {coins.map((coin) => (
              <ScreenerRow
                key={coin.symbol}
                coin={coin}
                onSelect={onSelectSymbol}
              />
            ))}
          </div>
        )}

        {meta && !loading && (
          <p className="mt-3 text-xs text-muted-foreground">
            {meta.scanned} ta USDT juftlik skanerlandi · {coins.length} ta
            kirish signali
          </p>
        )}
      </CardContent>
    </Card>
  );
}
