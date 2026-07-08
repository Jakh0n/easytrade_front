"use client";

import { Bell, BookmarkPlus, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AiSummary } from "@/components/AiSummary";
import { AnalyzeForm, type AnalyzeFormState } from "@/components/AnalyzeForm";
import { BacktestCard } from "@/components/BacktestCard";
import { ChatPanel } from "@/components/analyze/ChatPanel";
import { PageHeader } from "@/components/common/PageHeader";
import { PriceChart } from "@/components/PriceChart";
import { TradeVerdict } from "@/components/TradeVerdict";
import { Button } from "@/components/ui/button";
import { ApiError, type MarketType, streamAnalyzeSummary } from "@/lib/api";
import { useCreateAlert } from "@/hooks/useAlerts";
import { useCreateTrade } from "@/hooks/useJournal";
import { useAnalyze, useBacktest } from "@/hooks/useMarket";
import { useAddWatchlist } from "@/hooks/useWatchlist";
import { useAuthStore } from "@/lib/store/auth";

function toApiMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Xato yuz berdi";
}

export function AnalyzeView() {
  const searchParams = useSearchParams();
  const settings = useAuthStore((state) => state.user?.settings);

  const [form, setForm] = useState<AnalyzeFormState>(() => ({
    symbol: (searchParams.get("symbol") ?? "").toUpperCase(),
    interval: "4h",
    marketType:
      (searchParams.get("marketType") as MarketType | null) ??
      settings?.marketType ??
      "spot",
    capital: String(settings?.capital ?? 10_000),
    riskPercent: String(settings?.riskPercent ?? 2),
  }));

  const analyze = useAnalyze();
  const result = analyze.data;
  const backtest = useBacktest(
    result?.symbol ?? null,
    form.interval,
    form.marketType,
  );

  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  useEffect(() => {
    if (!result) return;

    const controller = new AbortController();
    setSummaryText("");
    setSummaryError(false);
    setSummaryLoading(true);

    streamAnalyzeSummary(
      {
        symbol: result.symbol,
        interval: result.interval as AnalyzeFormState["interval"],
        marketType: result.marketType,
        capital: Number(form.capital) || 10_000,
        riskPercent: Number(form.riskPercent) || 2,
      },
      {
        onToken: (token) => setSummaryText((prev) => prev + token),
        onError: () => setSummaryError(true),
        onDone: () => setSummaryLoading(false),
      },
      controller.signal,
    ).catch(() => {
      if (!controller.signal.aborted) {
        setSummaryError(true);
        setSummaryLoading(false);
      }
    });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const addWatchlist = useAddWatchlist();
  const createTrade = useCreateTrade();
  const createAlert = useCreateAlert();

  const runAnalyze = () => {
    analyze.mutate(
      {
        symbol: form.symbol.trim().toUpperCase(),
        interval: form.interval,
        marketType: form.marketType,
        capital: Number(form.capital) || 10_000,
        riskPercent: Number(form.riskPercent) || 2,
      },
      { onError: (error) => toast.error(toApiMessage(error)) },
    );
  };

  const handleAddWatchlist = () => {
    if (!result) return;
    addWatchlist.mutate(
      { symbol: result.symbol, marketType: result.marketType },
      {
        onSuccess: () => toast.success("Watchlist'ga qo'shildi"),
        onError: (error) => toast.error(toApiMessage(error)),
      },
    );
  };

  const handleSaveTrade = () => {
    if (!result) return;
    createTrade.mutate(
      {
        symbol: result.symbol,
        marketType: result.marketType,
        side: result.verdict.side ?? "long",
        strategy: result.strategy.label,
        entryPrice: result.currentPrice,
        stopLoss: result.risk.stopLoss,
        takeProfit: result.risk.takeProfit,
        size: result.risk.positionSize,
      },
      {
        onSuccess: () => toast.success("Savdo jurnalga saqlandi"),
        onError: (error) => toast.error(toApiMessage(error)),
      },
    );
  };

  const handleCreateAlert = () => {
    if (!result) return;
    createAlert.mutate(
      {
        symbol: result.symbol,
        marketType: result.marketType,
        type: "entry_zone",
        interval: form.interval,
      },
      {
        onSuccess: () => toast.success("Kirish zonasi uchun ogohlantirish"),
        onError: (error) => toast.error(toApiMessage(error)),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tahlil"
        description="Coin bo'yicha ko'p timeframe'li signal, risk darajalari va backtest"
      />

      <AnalyzeForm
        values={form}
        loading={analyze.isPending}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        onSubmit={runAnalyze}
      />

      {result && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddWatchlist}
              disabled={addWatchlist.isPending}
            >
              <Star className="size-3.5" />
              Watchlist
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveTrade}
              disabled={createTrade.isPending}
            >
              <BookmarkPlus className="size-3.5" />
              Jurnalga saqlash
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateAlert}
              disabled={createAlert.isPending}
            >
              <Bell className="size-3.5" />
              Kirish ogohlantirishi
            </Button>
          </div>

          <TradeVerdict result={result} />

          <PriceChart
            symbol={result.symbol}
            interval={result.interval}
            marketType={result.marketType}
            support={result.indicators.support}
            resistance={result.indicators.resistance}
            stopLoss={result.risk.stopLoss}
            takeProfit={result.risk.takeProfit}
            entry={result.currentPrice}
            side={result.verdict.side}
          />

          <BacktestCard
            summary={backtest.data}
            loading={backtest.isLoading}
            error={
              backtest.error ? toApiMessage(backtest.error) : undefined
            }
          />

          <AiSummary
            symbol={result.symbol}
            analysis={summaryText || result.analysis}
            loading={summaryLoading && !summaryText}
            error={summaryError && !summaryText}
          />

          <ChatPanel result={result} />
        </div>
      )}
    </div>
  );
}
