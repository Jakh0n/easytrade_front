"use client";

import { Activity, Crosshair, Info, Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDayScan, useRefreshDayScan } from "@/hooks/useFq";
import { ApiError, type DayAnalysis, type MarketType } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { pairLabel, pctChange, signed, timeAgo } from "@/lib/fq";
import { cn } from "@/lib/utils";
import { EmptyState, Metric, Panel, SideTag, Tag } from "./primitives";

function RValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className={value >= 0 ? "text-long" : "text-short"}>{signed(value, 2, "R")}</span>;
}

function DayCard({ coin }: { coin: DayAnalysis }) {
  const fresh = coin.flipBarsAgo === 0;
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{pairLabel(coin.symbol)}</span>
            <span className="text-xs text-muted-foreground">/USDT</span>
            <SideTag side={coin.side} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag tone="muted">Supertrend flip</Tag>
            <Tag tone={fresh ? "warn" : "muted"}>
              {fresh && <span className="size-1.5 animate-pulse rounded-full bg-warn" aria-hidden />}
              {fresh ? "Hozirgi sham" : `${coin.flipBarsAgo} sham oldin`}
            </Tag>
          </div>
        </div>
        <div className="text-right">
          <p className="num text-sm font-medium">{formatPrice(coin.currentPrice)}</p>
          <p className="num text-xs"><RValue value={coin.currentR} /></p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">Kirish</dt>
          <dd className="num truncate text-sm font-medium">{formatPrice(coin.entry)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">Stop</dt>
          <dd className="num truncate text-sm font-medium">{formatPrice(coin.stopLoss)}</dd>
          <dd className="num text-[11px] text-short">{signed(pctChange(coin.entry, coin.stopLoss))}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">Supertrend (chiqish)</dt>
          <dd className="num truncate text-sm font-medium">{formatPrice(coin.stLine)}</dd>
        </div>
      </dl>

      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        TP yo&apos;q — narx Supertrend chizig&apos;ini teskari kesib yopilganda chiqiladi. Risk: {coin.riskPercent}%.
      </p>
    </article>
  );
}

function statusText(coin: DayAnalysis): string {
  if (coin.verdict === "avoid") return coin.htfBias ? "Spot: short yo'q" : "1H trend yo'q";
  if (coin.flipBarsAgo !== null) return `Savdoda · flip ${coin.flipBarsAgo} sham oldin`;
  const aligned = (coin.side === "long" && coin.stDir === "up") || (coin.side === "short" && coin.stDir === "down");
  return aligned ? "Savdoda · flip 24 soatdan oldin" : "Flip kutilmoqda";
}

function DayTable({ coins }: { coins: DayAnalysis[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Day trade skaneri — barcha juftliklar holati</caption>
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Coin</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">1H trend</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Holat</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Supertrend</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Natija</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">24s</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Narx</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {coins.map((coin) => (
            <tr key={coin.symbol} className={cn(coin.verdict === "avoid" && "text-muted-foreground")}>
              <td className="px-3 py-2.5 font-medium">{pairLabel(coin.symbol)}</td>
              <td className="px-3 py-2.5"><SideTag side={coin.side} /></td>
              <td className="max-w-56 truncate px-3 py-2.5 text-muted-foreground" title={coin.reason}>{statusText(coin)}</td>
              <td className="num hidden px-3 py-2.5 text-right sm:table-cell">
                <span className={coin.stDir === "up" ? "text-long" : coin.stDir === "down" ? "text-short" : ""}>
                  {coin.stDir === "up" ? "↑ " : coin.stDir === "down" ? "↓ " : ""}
                  {formatPrice(coin.stLine)}
                </span>
              </td>
              <td className="num px-3 py-2.5 text-right"><RValue value={coin.currentR} /></td>
              <td className={cn("num hidden px-3 py-2.5 text-right sm:table-cell", coin.priceChangePercent >= 0 ? "text-long" : "text-short")}>
                {signed(coin.priceChangePercent)}
              </td>
              <td className="num px-3 py-2.5 text-right">{formatPrice(coin.currentPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DayScannerView({ market, controls }: { market: MarketType; controls: ReactNode }) {
  const scan = useDayScan(market);
  const refresh = useRefreshDayScan(market);
  const data = scan.data;
  const enter = data?.coins.filter((c) => c.verdict === "enter") ?? [];
  const rest = data?.coins.filter((c) => c.verdict !== "enter") ?? [];
  const busy = scan.isFetching || refresh.isPending;

  const onRefresh = () =>
    refresh.mutate(undefined, {
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Skaner xatosi"),
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Day trade skaneri</h1>
          <p className="text-sm text-muted-foreground">
            Supertrend(10, 3) · 15M kirish · 1H EMA 50/200 filtri · backtest qilingan {data?.scanned ?? 10} ta coin
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
              Yangilandi: {timeAgo(data.updatedAt)}
            </span>
          )}
          {controls}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Yangilash
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          Backtest (120 kun, 10 coin, 0.14% xarajat bilan): 5m va 15m dagi 9 ta g&apos;oyadan faqat shu biri foydada qoldi —
          o&apos;rtacha <span className="text-foreground">+0.07R</span> savdoga, win rate ~31%, PF 1.12. Edge yupqa:
          ko&apos;p kichik zarar, kam lekin katta foyda. Riskni 0.25–0.5% da ushlang, limit order ishlating.
        </p>
      </div>

      <Panel bodyClassName="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {data ? (
          <>
            <Metric label="Yangi flip" value={data.stats.enter} tone={data.stats.enter ? "warn" : undefined} hint="Oxirgi 2 sham" />
            <Metric label="Savdoda" value={data.stats.inTrade} hint="Flip bo'lgan, hali teskari emas" />
            <Metric label="Flip kutilmoqda" value={data.stats.waiting} hint="1H trend bor" />
            <Metric label="Trend yo'q" value={data.stats.avoid} hint="1H EMA mos emas" />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)
        )}
      </Panel>

      {scan.error && !data && (
        <Panel>
          <EmptyState icon={<RefreshCw className="size-4" />} title="Skaner ma'lumoti yuklanmadi">
            {scan.error instanceof ApiError ? scan.error.message : "Binance bilan aloqa xatosi"}
          </EmptyState>
        </Panel>
      )}

      <section aria-labelledby="day-live-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Crosshair className="size-4 text-primary" aria-hidden />
          <h2 id="day-live-heading" className="text-sm font-semibold">Yangi signallar</h2>
          {enter.length > 0 && <span className="num text-xs text-muted-foreground">{enter.length}</span>}
        </div>
        {scan.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
          </div>
        ) : enter.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {enter.map((coin) => <DayCard key={coin.symbol} coin={coin} />)}
          </div>
        ) : (
          data && (
            <Panel>
              <EmptyState icon={<Crosshair className="size-4" />} title="Hozir yangi flip yo'q">
                15M sham yopilganda Supertrend 1H trend tomonga o&apos;girilsa, signal shu yerda va Telegram&apos;da chiqadi.
              </EmptyState>
            </Panel>
          )
        )}
      </section>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" aria-hidden />
            Barcha juftliklar
          </span>
        }
        bodyClassName="p-0"
      >
        {scan.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
        ) : (
          rest.length > 0 && <DayTable coins={rest} />
        )}
      </Panel>
    </div>
  );
}
