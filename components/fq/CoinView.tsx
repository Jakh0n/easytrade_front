"use client";

import { ArrowLeft, CheckCircle2, Circle, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFqAnalysis } from "@/hooks/useFq";
import { ApiError, type FqAnalysis, type MarketType } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { pairLabel, pctChange, signed } from "@/lib/fq";
import { cn } from "@/lib/utils";
import { FqChart } from "./FqChart";
import { EmptyState, MarketToggle, Panel, SideTag, Tag, TrendIcon, VerdictTag } from "./primitives";
import { TradePlan } from "./TradePlan";

function Checklist({ analysis }: { analysis: FqAnalysis }) {
  const passed = analysis.checklist.filter((item) => item.passed).length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${analysis.score}%` }} />
        </div>
        <span className="num text-xs text-muted-foreground">
          {passed}/{analysis.checklist.length} · {analysis.score}/100
        </span>
      </div>
      <ul className="space-y-2.5">
        {analysis.checklist.map((item) => (
          <li key={item.label} className="flex gap-2.5 text-sm">
            {item.passed ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-long" aria-label="Bajarildi" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-label="Bajarilmadi" />
            )}
            <div className="min-w-0">
              <p className={item.passed ? "font-medium" : "text-muted-foreground"}>{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Indicators({ analysis }: { analysis: FqAnalysis }) {
  const ind = analysis.indicators;
  const extAtr = ind.atr ? Math.abs(analysis.currentPrice - ind.emaFast) / ind.atr : 0;
  const items: [string, string][] = [
    ["EMA 20", formatPrice(ind.emaFast)],
    ["EMA 50", formatPrice(ind.emaMid)],
    ["EMA 200", formatPrice(ind.emaSlow)],
    ["ATR 14", formatPrice(ind.atr)],
    ["ADX", ind.adx.toFixed(1)],
    ["+DI / −DI", `${ind.diPlus.toFixed(1)} / ${ind.diMinus.toFixed(1)}`],
    ["RSI 14", ind.rsi.toFixed(1)],
    ["EMA20 dan", `${extAtr.toFixed(2)} ATR`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[11px] text-muted-foreground">{label}</dt>
          <dd className="num text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CoinView({ symbol }: { symbol: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const market = (params.get("market") === "spot" ? "spot" : "futures") as MarketType;
  const analysis = useFqAnalysis(symbol, market);
  const [livePrice, setLivePrice] = useState<number | undefined>();
  const data = analysis.data;

  const onPrice = useCallback((price: number) => setLivePrice(price), []);
  const setMarket = (value: MarketType) => router.replace(`${pathname}?market=${value}`);

  const price = livePrice ?? data?.currentPrice;
  const levels =
    data?.side && data.stopLoss
      ? {
          side: data.side,
          entry: data.entry,
          stopLoss: data.stopLoss,
          tp1: data.tp1,
          tp2: data.tp2,
          signalTime: data.signalTime,
        }
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/dashboard" aria-label="Skanerga qaytish" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {pairLabel(symbol)}
                <span className="text-sm font-normal text-muted-foreground">/USDT</span>
              </h1>
              {data && (
                <>
                  <VerdictTag verdict={data.verdict} />
                  <SideTag side={data.side} />
                  {data.setup && <Tag tone="muted">{data.setup === "breakout" ? "Breakout" : "Pullback"}</Tag>}
                </>
              )}
            </div>
            {price !== undefined && (
              <p className="num text-sm" aria-live="off">
                {formatPrice(price)}
                {data && data.entry > 0 && data.side && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    kirishdan {signed(pctChange(data.entry, price))}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MarketToggle value={market} onChange={setMarket} />
          <Button variant="outline" size="sm" onClick={() => analysis.refetch()} disabled={analysis.isFetching}>
            {analysis.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Qayta tahlil
          </Button>
        </div>
      </div>

      {analysis.error && (
        <Panel>
          <EmptyState icon={<RefreshCw className="size-4" />} title={`${symbol} tahlil qilinmadi`}>
            {analysis.error instanceof ApiError ? analysis.error.message : "Juftlik topilmadi yoki Binance javob bermadi"}
          </EmptyState>
        </Panel>
      )}

      {data && (
        <p className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm">
          <TrendIcon trend={data.trend} />
          <span>{data.reason}</span>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel
            title={`Grafik · ${(data?.timeframe ?? "1h").toUpperCase()}`}
            action={
              <span className="num flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-slate-400" />EMA20</span>
                <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-amber-400" />EMA50</span>
                <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-blue-400" />EMA200</span>
              </span>
            }
            bodyClassName="p-2"
          >
            <FqChart symbol={symbol} marketType={market} levels={levels} onPrice={onPrice} />
          </Panel>
          <Panel title="Indikatorlar">
            {data ? <Indicators analysis={data} /> : <Skeleton className="h-24" />}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Savdo rejasi">
            {analysis.isLoading ? (
              <Skeleton className="h-64" />
            ) : data?.side && data.stopLoss ? (
              <TradePlan analysis={data} livePrice={livePrice} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {data?.reason ?? "Ma'lumot yo'q"}
              </p>
            )}
          </Panel>
          <Panel title="FQ v3 checklist">
            {data && data.checklist.length > 0 ? (
              <Checklist analysis={data} />
            ) : (
              <Skeleton className={cn("h-48", data && "hidden")} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
