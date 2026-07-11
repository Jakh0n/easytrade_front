import type { EmaSmcVerdict } from "@/lib/api";

export const EMA_SMC_VERDICT_LABELS: Record<EmaSmcVerdict, string> = {
  enter: "Kirish",
  wait: "Kutish",
  avoid: "Kirmaslik",
};

export function getEmaSmcVerdictStyles(verdict: EmaSmcVerdict): {
  badge: string;
  text: string;
} {
  switch (verdict) {
    case "enter":
      return {
        badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        text: "text-emerald-600 dark:text-emerald-400",
      };
    case "wait":
      return {
        badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        text: "text-amber-600 dark:text-amber-400",
      };
    default:
      return {
        badge: "bg-muted text-muted-foreground",
        text: "text-muted-foreground",
      };
  }
}

export function getEmaSmcScoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 45) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}
