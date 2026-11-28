"use client";

import { BellOff, Check, Cpu, Loader2, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEngineSignals, useEngineStats, useRunEngine } from "@/hooks/useEngine";
import { ApiError, type EngineStrategySummary, type EngineStrategyId } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import { pairLabel, signed } from "@/lib/fq";
import { cn } from "@/lib/utils";
import { EmptyState, Metric, Panel, SegmentToggle, SideTag, Tag } from "./primitives";

const STRATEGY_LABEL: Record<EngineStrategyId, string> = {
  trend_pullback: "Trend Pullback",
  pre_pump: "Pre-Pump",
  funding_squeeze: "Funding Squeeze",
  liquidity_sweep: "Liquidity Sweep",
  breakout_retest: "Breakout Retest",
};

const DAY_OPTIONS = [
  { value: "7", label: "7 kun" },
  { value: "30", label: "30 kun" },
  { value: "90", label: "90 kun" },
] as const;

const STATUS_LABEL: Record<string, { label: string; tone: "long" | "short" | "warn" | "muted" }> = {
  pending: { label: "Zona kutilmoqda", tone: "muted" },
  open: { label: "Ochiq", tone: "warn" },
  tp1: { label: "TP1 ✓ · BE", tone: "long" },
  tp2: { label: "TP2", tone: "long" },
  be: { label: "BE", tone: "muted" },
  sl: { label: "Stop", tone: "short" },
  expired: { label: "Expired", tone: "muted" },
  invalidated: { label: "Invalidated", tone: "muted" },
  timeout: { label: "Vaqt tugadi", tone: "muted" },
  watch: { label: "WATCH", tone: "warn" },
  upgraded: { label: "WATCH → ENTRY", tone: "long" },
  watch_expired: { label: "WATCH tugadi", tone: "muted" },
  missed: { label: "Missed (kech)", tone: "muted" },
  rejected_rr: { label: "R:R / xarajat", tone: "muted" },
  suppressed_conflict: { label: "Qarama-qarshi", tone: "muted" },
  capped: { label: "Soatlik limit", tone: "muted" },
};

const FILTER_LABEL: Record<string, string> = {
  missed: "missed",
  rejected_rr: "R:R",
  suppressed_conflict: "conflict",
  capped: "cap",
};

const num = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const pf = (x: number | null) => (x === null ? "∞" : num(x));
const rTone = (x: number) => (x > 0 ? "text-long" : x < 0 ? "text-short" : "text-muted-foreground");

function SummaryRow({ name, s, extra }: { name: React.ReactNode; s?: EngineStrategySummary; extra?: React.ReactNode }) {
  return (
    <tr className="hover:bg-muted/40">
      <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
        {name}
      </th>
      <td className="num px-3 py-2 text-right">{s?.signals ?? 0}</td>
      <td className="num hidden px-3 py-2 text-right sm:table-cell">{s ? `${s.filled}/${s.closed}` : "—"}</td>
      <td className="num px-3 py-2 text-right">{s && s.closed ? `${s.winRate.toFixed(0)}%` : "—"}</td>
      <td className={cn("num px-3 py-2 text-right font-medium", s ? rTone(s.avgR) : "")}>{s && s.closed ? signed(s.avgR, 2, "R") : "—"}</td>
      <td className={cn("num hidden px-3 py-2 text-right md:table-cell", s ? rTone(s.totalR) : "")}>{s && s.closed ? signed(s.totalR, 1, "R") : "—"}</td>
      <td className="num hidden px-3 py-2 text-right md:table-cell">{s && s.closed ? pf(s.profitFactor) : "—"}</td>
      <td className="num hidden px-3 py-2 text-right lg:table-cell">{s && s.closed ? `${num(s.maxDrawdownR, 1)}R` : "—"}</td>
      <td className="num hidden px-3 py-2 text-right lg:table-cell">{s?.avgMinutesToTp1 != null ? `${Math.round(s.avgMinutesToTp1)}m` : "—"}</td>
      {extra !== undefined && <td className="hidden px-3 py-2 text-right text-xs text-muted-foreground xl:table-cell">{extra}</td>}
    </tr>
  );
}

function SummaryHead({ first, extra }: { first: string; extra?: string }) {
  const th = "px-3 py-2 text-right font-medium";
  return (
    <thead className="border-b border-border text-xs text-muted-foreground">
      <tr>
        <th scope="col" className="px-3 py-2 text-left font-medium">{first}</th>
        <th scope="col" className={th}>Signal</th>
        <th scope="col" className={cn(th, "hidden sm:table-cell")}>To&apos;ldi/yopildi</th>
        <th scope="col" className={th}>Win</th>
        <th scope="col" className={th}>O&apos;rt. R</th>
        <th scope="col" className={cn(th, "hidden md:table-cell")}>Jami R</th>
        <th scope="col" className={cn(th, "hidden md:table-cell")}>PF</th>
        <th scope="col" className={cn(th, "hidden lg:table-cell")}>Max DD</th>
        <th scope="col" className={cn(th, "hidden lg:table-cell")}>→ TP1</th>
        {extra && <th scope="col" className={cn(th, "hidden xl:table-cell")}>{extra}</th>}
      </tr>
    </thead>
  );
}

export function EngineView() {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [showFiltered, setShowFiltered] = useState<"sent" | "all">("sent");
  const stats = useEngineStats(Number(days));
  const signals = useEngineSignals(showFiltered === "all");
  const run = useRunEngine();
  const data = stats.data;

  const onRun = () =>
    run.mutate(undefined, {
      onSuccess: (r) =>
        toast.success(
          `${r.evaluated} coin · ${r.rawSignals} xom signal · ${r.sent} yuborildi${r.updated ? ` · ${r.updated} yangilandi` : ""} (${(r.tookMs / 1000).toFixed(0)}s)`,
        ),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : "Engine xatosi"),
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Engine v2</h1>
          <p className="text-sm text-muted-foreground">
            5 ta mustaqil strategiya (OR) · konfluens bahosi A/B/C · anti-late filtr — natija R da, xarajatlar ayirilgan
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentToggle value={days} onChange={setDays} options={[...DAY_OPTIONS]} label="Davr" />
          <Button size="sm" onClick={onRun} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="animate-spin" /> : <Play />}
            Hozir ishga tushirish
          </Button>
        </div>
      </div>

      {data && !(data.telegram.configured && data.telegram.enabled) && (
        <div className="flex items-start gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm">
          <BellOff className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
          <p>
            Engine v2 Telegramga yubormaydi ({data.telegram.configured ? "ENGINE_TELEGRAM_ENABLED=false" : "Telegram sozlanmagan"}) —
            signallar shu yerda saqlanadi va natijalari kuzatiladi.{" "}
            <Link href="/settings" className="font-medium text-warn underline underline-offset-2">
              Sozlash
            </Link>
          </p>
        </div>
      )}

      <Panel bodyClassName="grid grid-cols-2 gap-5 lg:grid-cols-5">
        {data ? (
          <>
            <Metric label="Win rate" value={data.stats.overall.closed ? `${data.stats.overall.winRate.toFixed(0)}%` : "—"} hint={`${data.stats.overall.wins}W · ${data.stats.overall.losses}L`} />
            <Metric label="Jami natija" value={signed(data.stats.overall.totalR, 2, "R")} tone={data.stats.overall.totalR >= 0 ? "long" : "short"} />
            <Metric label="Profit factor" value={data.stats.overall.closed ? pf(data.stats.overall.profitFactor) : "—"} hint={`max DD ${num(data.stats.overall.maxDrawdownR, 1)}R`} />
            <Metric label="Ochiq / kutilmoqda" value={data.stats.overall.open} tone={data.stats.overall.open ? "warn" : undefined} />
            <Metric label="WATCH" value={data.watches.total} hint={`${data.watches.upgraded} ta ENTRY ga o'tdi`} />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)
        )}
      </Panel>

      <Panel title="Strategiyalar" bodyClassName="p-0">
        {data ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Strategiyalar bo&apos;yicha natija</caption>
              <SummaryHead first="Strategiya" extra="Filtrlangan" />
              <tbody className="divide-y divide-border">
                {data.strategies.map((st) => {
                  const f = data.filtered[st.id] ?? {};
                  const filteredText = Object.entries(f)
                    .map(([k, v]) => `${FILTER_LABEL[k] ?? k} ${v}`)
                    .join(" · ");
                  return (
                    <SummaryRow
                      key={st.id}
                      name={
                        <span className="inline-flex items-center gap-2">
                          {st.label}
                          {!st.enabled && <Tag tone="muted">o&apos;chiq</Tag>}
                        </span>
                      }
                      s={data.stats.byStrategy[st.id]}
                      extra={filteredText || "—"}
                    />
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Konfluens signali unga qo&apos;shilgan har bir strategiyaga hisoblanadi. Filtrlangan = yuborilmagan (kech, R:R, qarama-qarshi, limit).
            </p>
          </div>
        ) : (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
        )}
      </Panel>

      {data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Rejim bo'yicha" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Strategiya va bozor rejimi bo&apos;yicha</caption>
                <SummaryHead first="Strategiya · rejim" />
                <tbody className="divide-y divide-border">
                  {Object.entries(data.stats.byStrategyRegime).flatMap(([st, regimes]) =>
                    Object.entries(regimes).map(([regime, s]) => (
                      <SummaryRow key={`${st}-${regime}`} name={`${STRATEGY_LABEL[st as EngineStrategyId] ?? st} · ${regime}`} s={s} />
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Baho bo'yicha" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Konfluens bahosi bo&apos;yicha</caption>
                <SummaryHead first="Baho" />
                <tbody className="divide-y divide-border">
                  {(["A", "B", "C"] as const).map((g) => (
                    <SummaryRow key={g} name={`Grade ${g}`} s={data.stats.byGrade[g]} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      <Panel
        title="So'nggi signallar"
        action={
          <SegmentToggle
            value={showFiltered}
            onChange={setShowFiltered}
            options={[
              { value: "sent", label: "Yuborilgan" },
              { value: "all", label: "Hammasi" },
            ]}
            label="Ko'rinish"
          />
        }
        bodyClassName="p-0"
      >
        {signals.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : signals.data && signals.data.signals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Engine v2 signallari</caption>
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Vaqt</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Coin</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Yo&apos;nalish</th>
                  <th scope="col" className="hidden px-3 py-2 text-left font-medium md:table-cell">Strategiyalar</th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">Zona</th>
                  <th scope="col" className="hidden px-3 py-2 text-right font-medium lg:table-cell">Stop</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Holat</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Natija</th>
                  <th scope="col" className="hidden px-3 py-2 text-center font-medium sm:table-cell">TG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {signals.data.signals.map((s) => {
                  const meta = STATUS_LABEL[s.status] ?? { label: s.status, tone: "muted" as const };
                  return (
                    <tr key={s.id} className="hover:bg-muted/40" title={[s.note, ...s.reasons].filter(Boolean).join(" · ")}>
                      <td className="num px-3 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(s.createdAt)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Link href={`/coin/${s.symbol}?market=futures`} className="font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                          {pairLabel(s.symbol)}
                        </Link>
                        <span className="ml-1.5 text-xs text-muted-foreground">{s.kind === "watch" ? "WATCH" : `Grade ${s.grade}`}</span>
                      </td>
                      <td className="px-3 py-2.5"><SideTag side={s.direction} /></td>
                      <td className="hidden px-3 py-2.5 text-xs md:table-cell">{s.strategies.map((x) => STRATEGY_LABEL[x] ?? x).join(" + ")}</td>
                      <td className="num hidden px-3 py-2.5 text-right whitespace-nowrap lg:table-cell">
                        {formatPrice(s.entryZoneLow)} – {formatPrice(s.entryZoneHigh)}
                      </td>
                      <td className="num hidden px-3 py-2.5 text-right text-short lg:table-cell">{s.stopLoss === null ? "—" : formatPrice(s.stopLoss)}</td>
                      <td className="px-3 py-2.5"><Tag tone={meta.tone}>{meta.label}</Tag></td>
                      <td className={cn("num px-3 py-2.5 text-right font-medium", s.netR === null ? "text-muted-foreground" : rTone(s.netR))}>
                        {s.netR === null ? "—" : signed(s.netR, 2, "R")}
                      </td>
                      <td className="hidden px-3 py-2.5 text-center sm:table-cell">
                        {s.telegramSent ? <Check className="mx-auto size-4 text-long" aria-label="Telegramga yuborilgan" /> : <span className="text-muted-foreground" aria-label="Yuborilmagan">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Cpu className="size-4" />} title="Hali engine signali yo'q">
            cron-job.org <code>/api/engine/run</code> ni har daqiqada chaqirganda signallar shu yerda paydo bo&apos;ladi.
          </EmptyState>
        )}
      </Panel>
    </div>
  );
}
