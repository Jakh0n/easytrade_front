"use client";

import { BarChart3 } from "lucide-react";
import { useState } from "react";

import { AnalyzeForm } from "@/components/AnalyzeForm";
import { AiSummary } from "@/components/AiSummary";
import { MarketScreener } from "@/components/MarketScreener";
import { PriceChart } from "@/components/PriceChart";
import { TradeVerdict } from "@/components/TradeVerdict";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  analyzeSymbol,
  type AnalyzePayload,
  type AnalyzeResponse,
  type MarketType,
} from "@/lib/api";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [marketType, setMarketType] = useState<MarketType>("spot");

  const handleAnalyze = async (payload: AnalyzePayload) => {
    setLoading(true);
    setError(null);

    try {
      const data = await analyzeSymbol(payload);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(
        err instanceof Error ? err.message : "Kutilmagan xato yuz berdi",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,oklch(0.97_0.01_240)_0%,var(--background)_240px)] dark:bg-[linear-gradient(180deg,oklch(0.18_0.02_240)_0%,var(--background)_240px)]">
      <header className="border-b border-border/60 bg-card/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">
              EasyTrade AI
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Spot trading tahlil
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <MarketScreener
          marketType={marketType}
          onSelectSymbol={(selected) => {
            setSymbol(selected);
            setResult(null);
          }}
        />

        <AnalyzeForm
          loading={loading}
          symbol={symbol}
          marketType={marketType}
          onSymbolChange={setSymbol}
          onMarketTypeChange={(type) => {
            setMarketType(type);
            setResult(null);
          }}
          onAnalyze={handleAnalyze}
        />

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Xato</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && !result && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Coin tanlang va tahlil qiling.
          </p>
        )}

        {result && (
          <div className="space-y-5">
            <TradeVerdict result={result} />
            <PriceChart
              symbol={result.symbol}
              interval={result.interval}
              marketType={result.marketType}
              support={result.indicators.support}
              resistance={result.indicators.resistance}
              stopLoss={result.risk.stopLoss}
              takeProfit={result.risk.takeProfit}
              entry={
                (result.verdict.entryZone[0] + result.verdict.entryZone[1]) / 2
              }
              side={result.verdict.side}
            />
            <AiSummary symbol={result.symbol} analysis={result.analysis} />
          </div>
        )}
      </main>
    </div>
  );
}
