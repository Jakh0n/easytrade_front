"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import type { FqVerdict, MarketType, TradeSide } from "@/lib/api";
import { TONE_CLASS, VERDICT_LABEL, sideText } from "@/lib/fq";
import { cn } from "@/lib/utils";

export function Tag({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TONE_CLASS;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap ring-1 ring-inset",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Yo'nalish: rang + ikon + matn (faqat rangga tayanmaslik uchun). */
export function SideTag({ side, className }: { side: TradeSide; className?: string }) {
  if (!side) return <Tag tone="muted" className={className}>—</Tag>;
  const Icon = side === "long" ? ArrowUpRight : ArrowDownRight;
  return (
    <Tag tone={side} className={className}>
      <Icon className="size-3" aria-hidden />
      {sideText(side)}
    </Tag>
  );
}

export function VerdictTag({ verdict }: { verdict: FqVerdict }) {
  const tone = verdict === "enter" ? "warn" : "muted";
  return (
    <Tag tone={tone}>
      {verdict === "enter" && <span className="size-1.5 animate-pulse rounded-full bg-warn" aria-hidden />}
      {VERDICT_LABEL[verdict]}
    </Tag>
  );
}

export function TrendIcon({ trend }: { trend: "up" | "down" | "neutral" }) {
  if (trend === "up") return <ArrowUpRight className="size-3.5 text-long" aria-label="Trend yuqoriga" />;
  if (trend === "down") return <ArrowDownRight className="size-3.5 text-short" aria-label="Trend pastga" />;
  return <Minus className="size-3.5 text-muted-foreground" aria-label="Trend neytral" />;
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      {(title || action) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "long" | "short" | "warn";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "num mt-1 truncate text-lg font-semibold",
          tone === "long" && "text-long",
          tone === "short" && "text-short",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SegmentToggle<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 rounded-md border border-border bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "cursor-pointer rounded px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === option.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const MARKET_OPTIONS: { value: MarketType; label: string }[] = [
  { value: "futures", label: "Futures" },
  { value: "spot", label: "Spot" },
];

export function MarketToggle({
  value,
  onChange,
}: {
  value: MarketType;
  onChange: (value: MarketType) => void;
}) {
  return <SegmentToggle value={value} onChange={onChange} options={MARKET_OPTIONS} label="Bozor turi" />;
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
