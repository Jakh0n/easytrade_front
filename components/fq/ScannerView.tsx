"use client";

import { Crosshair, Eye, Loader2, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFqScan, useRefreshScan } from "@/hooks/useFq";
import { ApiError, type MarketType } from "@/lib/api";
import { timeAgo } from "@/lib/fq";
import { EmptyState, MarketToggle, Metric, Panel } from "./primitives";
import { SignalCard } from "./SignalCard";
import { WatchTable } from "./WatchTable";

function Breadth({ up, down, total }: { up: number; down: number; total: number }) {
  const upPct = total ? (up / total) * 100 : 0;
  const downPct = total ? (down / total) * 100 : 0;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Bozor kengligi</p>
      <div className="num mt-1 flex items-baseline gap-2 text-lg font-semibold">
        <span className="text-long">↑{up}</span>
        <span className="text-short">↓{down}</span>
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-long" style={{ width: `${upPct}%` }} />
        <div className="ml-auto bg-short" style={{ width: `${downPct}%` }} />
      </div>
    </div>
  );
}

export function ScannerView() {
  const [market, setMarket] = useState<MarketType>("futures");
  return <SwingScanner market={market} controls={<MarketToggle value={market} onChange={setMarket} />} />;
}

function SwingScanner({ market, controls }: { market: MarketType; controls: ReactNode }) {
  const scan = useFqScan(market);
  const refresh = useRefreshScan(market);
  const data = scan.data;

  const enter = data?.coins.filter((c) => c.verdict === "enter") ?? [];
  const wait = data?.coins.filter((c) => c.verdict === "wait") ?? [];
  const busy = scan.isFetching || refresh.isPending;

  const onRefresh = () =>
    refresh.mutate(undefined, {
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Skaner xatosi"),
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Bozor skaneri</h1>
          <p className="text-sm text-muted-foreground">
            FQ Strategy v3 · 1H kirish · 4H EMA 200 filtri · eng likvid {data?.scanned ?? 100} juftlik
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

      <Panel bodyClassName="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {data ? (
          <>
            <Metric label="Kirish signallari" value={data.stats.enter} tone={data.stats.enter ? "warn" : undefined} hint="Oxirgi 3 shamda" />
            <Metric label="Kuzatuvda" value={data.stats.wait} hint="Trend bor, trigger yo'q" />
            <Breadth up={data.stats.longBias} down={data.stats.shortBias} total={data.coins.length} />
            <Metric label="Skanerlangan" value={data.scanned} hint={market === "futures" ? "USDT-M perpetual" : "Spot USDT"} />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)
        )}
      </Panel>

      {scan.error && !data && (
        <Panel>
          <EmptyState icon={<RefreshCw className="size-4" />} title="Skaner ma'lumoti yuklanmadi">
            {scan.error instanceof ApiError ? scan.error.message : "Binance bilan aloqa xatosi"}
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => scan.refetch()}>
                Qayta urinish
              </Button>
            </div>
          </EmptyState>
        </Panel>
      )}

      <section aria-labelledby="live-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <Crosshair className="size-4 text-primary" aria-hidden />
          <h2 id="live-heading" className="text-sm font-semibold">Faol signallar</h2>
          {enter.length > 0 && <span className="num text-xs text-muted-foreground">{enter.length}</span>}
        </div>
        {scan.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-56 rounded-lg" />
            ))}
          </div>
        ) : enter.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {enter.map((coin) => (
              <SignalCard key={coin.symbol} coin={coin} />
            ))}
          </div>
        ) : (
          data && (
            <Panel>
              <EmptyState icon={<Crosshair className="size-4" />} title="Hozir faol signal yo'q">
                FQ v3 barcha shartlar bajarilganda signal beradi — bu tez-tez bo&apos;lmaydi.
                Signal chiqqanda Telegram&apos;ga xabar keladi.
              </EmptyState>
            </Panel>
          )
        )}
      </section>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <Eye className="size-4 text-muted-foreground" aria-hidden />
            Kuzatuv ro&apos;yxati
            {wait.length > 0 && <span className="num text-xs font-normal text-muted-foreground">{wait.length}</span>}
          </span>
        }
        bodyClassName="p-0"
      >
        {scan.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : wait.length > 0 ? (
          <WatchTable coins={wait} />
        ) : (
          data && (
            <EmptyState icon={<Eye className="size-4" />} title="Kuzatuvda coin yo'q">
              Trendli va ADX filtridan o&apos;tgan juftlik topilmadi.
            </EmptyState>
          )
        )}
      </Panel>
    </div>
  );
}
