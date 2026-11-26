"use client";

import { BellOff, Check, History, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunSignals, useSignals } from "@/hooks/useFq";
import { ApiError, type SignalRecord, type StrategyId } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import { STATUS_META, STRATEGY_LABEL, pairLabel, signed } from "@/lib/fq";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  Metric,
  Panel,
  SegmentToggle,
  SideTag,
  Tag,
} from "./primitives";

type Filter = "all" | StrategyId;

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all", label: "Hammasi" },
  { value: "fq_v3", label: STRATEGY_LABEL.fq_v3 },
  { value: "fq_4h", label: STRATEGY_LABEL.fq_4h },
  { value: "smc_4h", label: STRATEGY_LABEL.smc_4h },
  { value: "st_day", label: STRATEGY_LABEL.st_day },
];

/** Yopilgan signallar bo'yicha kumulyativ R egri chizig'i (eng eskisidan yangisiga). */
function EquityCurve({ signals }: { signals: SignalRecord[] }) {
  const closed = signals
    .filter((s) => s.resultR !== null && s.closedAt)
    .sort(
      (a, b) =>
        new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime(),
    );
  if (closed.length < 2) return null;

  const points = closed.reduce<number[]>(
    (acc, s) => [...acc, acc.at(-1)! + (s.resultR ?? 0)],
    [0],
  );
  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const span = max - min || 1;
  const w = 600;
  const h = 120;
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * h;
  const path = points
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const final = points.at(-1)!;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Kumulyativ natija ${closed.length} ta savdo bo'yicha ${final.toFixed(2)}R`}
      >
        <line
          x1={0}
          x2={w}
          y1={y(0)}
          y2={y(0)}
          className="stroke-border"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className={final >= 0 ? "stroke-long" : "stroke-short"}
        />
      </svg>
      <figcaption className="mt-1 text-xs text-muted-foreground">
        Kumulyativ natija, R · {closed.length} ta yopilgan savdo
      </figcaption>
    </figure>
  );
}

export function SignalsView() {
  const [filter, setFilter] = useState<Filter>("all");
  const signals = useSignals(filter === "all" ? undefined : filter);
  const run = useRunSignals();
  const data = signals.data;

  const onRun = () =>
    run.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          r.newSignals
            ? `${r.newSignals} ta yangi signal · ${r.sent} ta Telegramga yuborildi`
            : `Yangi signal yo'q · ${r.scanned} juftlik tekshirildi${r.updated ? ` · ${r.updated} ta natija yangilandi` : ""}`,
        ),
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.message : "Tekshiruv xatosi"),
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Signallar</h1>
          <p className="text-sm text-muted-foreground">
            Swing (FQ v3, TP1 50% + qolgan qism) va Day trade (Supertrend,
            flipda chiqish) natijalari — R birligida
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentToggle
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS}
            label="Strategiya"
          />
          <Button size="sm" onClick={onRun} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            Hozir tekshirish
          </Button>
        </div>
      </div>

      {data && !(data.telegram.configured && data.telegram.enabled) && (
        <div className="flex items-start gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm">
          <BellOff className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <p>
            Telegram bildirishnomalari{" "}
            {data.telegram.configured ? "o'chirilgan" : "sozlanmagan"} —
            signallar faqat shu yerda saqlanadi.{" "}
            <Link
              href="/settings"
              className="font-medium text-warn underline underline-offset-2"
            >
              Sozlash
            </Link>
          </p>
        </div>
      )}

      <Panel bodyClassName="grid grid-cols-2 gap-5 lg:grid-cols-5">
        {data ? (
          <>
            <Metric
              label="Win rate"
              value={`${data.stats.winRate.toFixed(0)}%`}
              hint={`${data.stats.wins}W · ${data.stats.losses}L`}
            />
            <Metric
              label="Jami natija"
              value={signed(data.stats.totalR, 2, "R")}
              tone={data.stats.totalR >= 0 ? "long" : "short"}
            />
            <Metric
              label="O'rtacha"
              value={signed(data.stats.avgR, 2, "R")}
              hint="har savdoga"
            />
            <Metric
              label="Ochiq"
              value={data.stats.open}
              tone={data.stats.open ? "warn" : undefined}
            />
            <Metric label="Jami signal" value={data.stats.total} />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))
        )}
      </Panel>

      {data && <EquityCurve signals={data.signals} />}

      <Panel title="Tarix" bodyClassName="p-0">
        {signals.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : data && data.signals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Signallar tarixi</caption>
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Vaqt
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Coin
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Yo&apos;nalish
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-right font-medium md:table-cell"
                  >
                    Kirish
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-right font-medium md:table-cell"
                  >
                    Stop
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-right font-medium lg:table-cell"
                  >
                    TP1
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-right font-medium lg:table-cell"
                  >
                    TP2
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Holat
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Natija
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-center font-medium sm:table-cell"
                  >
                    TG
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.signals.map((s) => {
                  const meta = STATUS_META[s.status];
                  return (
                    <tr key={s.id} className="hover:bg-muted/40">
                      <td className="num px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                        {formatDate(s.signalTime)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/coin/${s.symbol}?market=${s.marketType}`}
                          className="font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {pairLabel(s.symbol)}
                        </Link>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {s.strategy === "st_day"
                            ? "Day"
                            : s.strategy === "smc_4h"
                              ? "OTE"
                            : `${s.strategy === "fq_4h" ? "4H " : ""}${s.setup === "breakout" ? "BO" : "PB"}`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <SideTag side={s.side} />
                      </td>
                      <td className="num hidden px-3 py-2.5 text-right md:table-cell">
                        {formatPrice(s.entry)}
                      </td>
                      <td className="num hidden px-3 py-2.5 text-right text-short md:table-cell">
                        {formatPrice(s.stopLoss)}
                      </td>
                      <td className="num hidden px-3 py-2.5 text-right lg:table-cell">
                        {s.tp1 === null ? "—" : formatPrice(s.tp1)}
                      </td>
                      <td className="num hidden px-3 py-2.5 text-right lg:table-cell">
                        {s.tp2 === null ? "—" : formatPrice(s.tp2)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Tag tone={meta.tone}>{meta.label}</Tag>
                      </td>
                      <td
                        className={cn(
                          "num px-3 py-2.5 text-right font-medium",
                          s.resultR === null
                            ? "text-muted-foreground"
                            : s.resultR >= 0
                              ? "text-long"
                              : "text-short",
                        )}
                      >
                        {s.resultR === null ? "—" : signed(s.resultR, 2, "R")}
                      </td>
                      <td className="hidden px-3 py-2.5 text-center sm:table-cell">
                        {s.telegramSent ? (
                          <Check
                            className="mx-auto size-4 text-long"
                            aria-label="Telegramga yuborilgan"
                          />
                        ) : (
                          <span
                            className="text-muted-foreground"
                            aria-label="Yuborilmagan"
                          >
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<History className="size-4" />}
            title="Hali signal yo'q"
          >
            Cron har bir necha daqiqada bozorni tekshiradi. Signal chiqqanda shu
            yerda paydo bo&apos;ladi va Telegramga yuboriladi.
          </EmptyState>
        )}
      </Panel>
    </div>
  );
}
