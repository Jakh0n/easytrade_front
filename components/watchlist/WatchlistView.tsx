"use client";

import { Loader2, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAddWatchlist,
  useRemoveWatchlist,
  useWatchlist,
} from "@/hooks/useWatchlist";
import { ApiError, type MarketType } from "@/lib/api";
import { formatDate } from "@/lib/format";

export function WatchlistView() {
  const { data: items = [], isLoading } = useWatchlist();
  const addItem = useAddWatchlist();
  const removeItem = useRemoveWatchlist();

  const [symbol, setSymbol] = useState("");
  const [marketType, setMarketType] = useState<MarketType>("spot");

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    if (!symbol.trim()) return;
    addItem.mutate(
      { symbol: symbol.trim().toUpperCase(), marketType },
      {
        onSuccess: () => {
          toast.success("Qo'shildi");
          setSymbol("");
        },
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
        title="Watchlist"
        description="Kuzatilayotgan coinlar ro'yxati"
      />

      <form
        onSubmit={handleAdd}
        className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-border/60 bg-card p-4"
      >
        <div className="flex-1 space-y-1.5">
          <label htmlFor="wl-symbol" className="text-sm font-medium">
            Coin symbol
          </label>
          <Input
            id="wl-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="BTCUSDT"
          />
        </div>
        <Select value={marketType} onValueChange={(v) => setMarketType(v as MarketType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="spot">Spot</SelectItem>
            <SelectItem value="futures">Futures</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={addItem.isPending}>
          Qo&apos;shish
        </Button>
      </form>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={<Star className="size-6" />}
          title="Watchlist bo'sh"
          description="Coin qo'shing yoki skanerdan tanlang."
        />
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border/60">
          {items.map((item) => (
            <div
              key={item._id}
              className="flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-b-0 hover:bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.symbol}</span>
                  <Badge variant="outline" className="text-xs">
                    {item.marketType === "futures" ? "Futures" : "Spot"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Qo&apos;shilgan: {formatDate(item.createdAt)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link
                    href={`/analyze?symbol=${item.symbol}&marketType=${item.marketType}`}
                  />
                }
              >
                Tahlil
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="O'chirish"
                onClick={() =>
                  removeItem.mutate(item._id, {
                    onSuccess: () => toast.success("O'chirildi"),
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
