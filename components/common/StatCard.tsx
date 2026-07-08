import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "green" | "red" | "amber";
}

const ACCENT: Record<NonNullable<StatCardProps["accent"]>, string> = {
  default: "text-foreground",
  green: "text-emerald-600 dark:text-emerald-400",
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-600 dark:text-amber-400",
};

export function StatCard({
  label,
  value,
  hint,
  accent = "default",
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", ACCENT[accent])}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
