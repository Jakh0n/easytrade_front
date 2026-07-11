"use client";

import { ArrowLeft, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StrategyAnalysisCard } from "@/components/strategies/StrategyAnalysisCard";
import { StrategyCoinList } from "@/components/strategies/StrategyCoinList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStrategyAnalyze } from "@/hooks/useMarket";
import { ApiError, type CustomStrategyId } from "@/lib/api";

const STRATEGY_META: Record<
  CustomStrategyId,
  { name: string; description: string; checklist: string[] }
> = {
  ema_smc: {
    name: "EMA + SMC",
    description:
      "4H EMA 200 trend, kunlik likvidlik darajalari, sweep, 5M BOS/CHoCH va FVG/OB kirish.",
    checklist: [
      "EMA 200 trendni tasdiqlaydi",
      "Likvidlik sweep",
      "BOS yoki CHoCH tasdiqlangan",
      "FVG yoki OB da kirish",
      "Har bir savdoda 1% risk",
      "Minimal R:R = 1:2",
    ],
  },
};

function toApiMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Xato yuz berdi";
}

interface StrategyDetailViewProps {
  strategyId: CustomStrategyId;
}

export function StrategyDetailView({ strategyId }: StrategyDetailViewProps) {
  const searchParams = useSearchParams();
  const meta = STRATEGY_META[strategyId];

  const [symbol, setSymbol] = useState(
    (searchParams.get("symbol") ?? "BTCUSDT").toUpperCase(),
  );
  const [marketType, setMarketType] = useState<"spot" | "futures">("futures");

  const analyze = useStrategyAnalyze();

  const runAnalyze = useCallback(
    (sym?: string) => {
      const target = (sym ?? symbol).trim().toUpperCase();
      if (!target) return;
      setSymbol(target);
      analyze.mutate(
        { strategyId, symbol: target, marketType },
        { onError: (error) => toast.error(toApiMessage(error)) },
      );
    },
    [analyze, marketType, strategyId, symbol],
  );

  const handleSelectCoin = (sym: string) => {
    runAnalyze(sym);
  };

  if (!meta) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Strategiya topilmadi
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/strategies" aria-label="Strategiyalarga qaytish" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title={meta.name}
          description={meta.description}
        />
      </div>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">Strategiya qoidalari</h3>
        <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
          <li>4H: Narx EMA 200 dan yuqori → faqat BUY, past → faqat SELL</li>
          <li>PDH, PDL, EQH, EQL darajalarini belgilash</li>
          <li>Likvidlik sweep kutish</li>
          <li>5M da BOS yoki CHoCH tasdiqlash</li>
          <li>FVG yoki OB da kirish</li>
          <li>SL: oxirgi swing high/low</li>
          <li>TP: keyingi likvidlik, min R:R 1:2</li>
        </ol>
      </section>

      <section className="flex flex-wrap gap-2">
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="BTCUSDT"
          className="max-w-[180px]"
        />
        <Button
          onClick={() => runAnalyze()}
          disabled={analyze.isPending}
        >
          {analyze.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Search />
          )}
          Tahlil qilish
        </Button>
      </section>

      {analyze.data && <StrategyAnalysisCard analysis={analyze.data} />}

      <StrategyCoinList
        strategyId={strategyId}
        onSelect={handleSelectCoin}
      />
    </div>
  );
}
