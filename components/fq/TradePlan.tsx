"use client";

import type { FqAnalysis } from "@/lib/api";
import { formatPrice, formatQuantity, formatUsd } from "@/lib/format";
import { pctChange, planPosition, signed } from "@/lib/fq";
import { useAuthStore } from "@/lib/store/auth";
import { cn } from "@/lib/utils";
import { RLadder } from "./RLadder";

function Row({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "long" | "short";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right">
        <span className="num text-sm font-medium">{value}</span>
        {sub && (
          <span className={cn("num ml-2 text-xs", tone === "long" ? "text-long" : tone === "short" ? "text-short" : "text-muted-foreground")}>
            {sub}
          </span>
        )}
      </dd>
    </div>
  );
}

export function TradePlan({ analysis, livePrice }: { analysis: FqAnalysis; livePrice?: number }) {
  const settings = useAuthStore((s) => s.user?.settings);
  if (!analysis.side || !analysis.stopLoss) return null;

  const capital = settings?.capital ?? 1000;
  const riskPct = settings?.riskPercent ?? analysis.riskPercent;
  const plan = planPosition(capital, riskPct, analysis.entry, analysis.stopLoss);
  const isSignal = analysis.signalBarsAgo !== null;

  return (
    <div className="space-y-4">
      {!isSignal && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Signal hali yo&apos;q — darajalar joriy shamga qarab taxminiy. Trigger sham yopilganda qayta hisoblanadi.
        </p>
      )}

      <dl className="divide-y divide-border">
        <Row label="Kirish" value={formatPrice(analysis.entry)} sub="sham yopilishi" />
        <Row label="Stop Loss" value={formatPrice(analysis.stopLoss)} sub={signed(pctChange(analysis.entry, analysis.stopLoss))} tone="short" />
        <Row label="TP1 · 50% yopish" value={formatPrice(analysis.tp1)} sub={signed(pctChange(analysis.entry, analysis.tp1))} tone="long" />
        <Row label={`TP2 · ${analysis.riskReward}R`} value={formatPrice(analysis.tp2)} sub={signed(pctChange(analysis.entry, analysis.tp2))} tone="long" />
      </dl>

      <RLadder
        side={analysis.side}
        entry={analysis.entry}
        stopLoss={analysis.stopLoss}
        tp1={analysis.tp1}
        tp2={analysis.tp2}
        price={livePrice ?? analysis.currentPrice}
      />

      {plan && (
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Pozitsiya hajmi · kapital {formatUsd(capital)} · risk {riskPct}%
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Riskdagi pul</dt>
              <dd className="num font-medium text-short">{formatUsd(plan.riskAmount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Miqdor</dt>
              <dd className="num font-medium">{formatQuantity(plan.quantity)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pozitsiya (notional)</dt>
              <dd className="num font-medium">{formatUsd(plan.notional)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Kerakli leverage</dt>
              <dd className={cn("num font-medium", plan.leverage > 5 && "text-warn")}>
                {plan.leverage}x{plan.leverage > 5 ? " · yuqori" : ""}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            TP1 dan keyin stop BE + 0.1R ga suriladi — qolgan qism risksiz.
          </p>
        </div>
      )}
    </div>
  );
}
