"use client";

import { BarChart3, Sparkles } from "lucide-react";
import { useState } from "react";

import { AnalyzeForm } from "@/components/AnalyzeForm";
import { AiSummary } from "@/components/AiSummary";
import { PriceChart } from "@/components/PriceChart";
import { RiskCard } from "@/components/RiskCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  analyzeSymbol,
  type AnalyzePayload,
  type AnalyzeResponse,
} from "@/lib/api";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [lastPayload, setLastPayload] = useState<AnalyzePayload | null>(null);

  const handleAnalyze = async (payload: AnalyzePayload) => {
    setLoading(true);
    setError(null);
    setLastPayload(payload);

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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                EasyTrade AI
              </h1>
              <p className="text-sm text-muted-foreground">
                Kripto spot trading tahlili
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <AnalyzeForm loading={loading} onAnalyze={handleAnalyze} />

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Xato</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && !error && !result && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-7" />
            </div>
            <h2 className="text-lg font-semibold">Tahlilni boshlang</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Coin symbol, timeframe va risk parametrlarini kiriting, so&apos;ng
              &quot;Tahlil qilish&quot; tugmasini bosing. Natijada grafik, risk
              darajalari va AI tahlili ko&apos;rsatiladi.
            </p>
          </div>
        )}

        {result && lastPayload && (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <PriceChart
                  symbol={result.symbol}
                  interval={result.interval}
                  support={result.indicators.support}
                  resistance={result.indicators.resistance}
                />
              </div>
              <RiskCard
                currentPrice={result.currentPrice}
                trend={result.trend}
                risk={result.risk}
                riskPercent={lastPayload.riskPercent}
              />
            </div>

            <AiSummary symbol={result.symbol} analysis={result.analysis} />
          </div>
        )}
      </main>
    </div>
  );
}
