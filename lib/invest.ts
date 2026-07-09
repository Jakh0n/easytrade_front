import type { InvestVerdict } from "@/lib/api";

export const HORIZON_OPTIONS = [
  { value: "1_3" as const, label: "1-3 oy", hint: "Qisqa muddatli jamg'arish" },
  { value: "3_6" as const, label: "3-6 oy", hint: "O'rta muddatli pozitsiya" },
  { value: "6_12" as const, label: "6-12 oy", hint: "Uzoq muddatli hold" },
  { value: "12_24" as const, label: "12-24 oy", hint: "2 yillik investitsiya" },
];

export function getInvestVerdictStyles(verdict: InvestVerdict): {
  badge: string;
  border: string;
} {
  switch (verdict) {
    case "accumulate":
      return {
        badge:
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-500/30",
      };
    case "avoid":
      return {
        badge: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
        border: "border-red-500/30",
      };
    default:
      return {
        badge:
          "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        border: "border-amber-500/30",
      };
  }
}

export function getInvestActionLabel(verdict: InvestVerdict): string {
  switch (verdict) {
    case "accumulate":
      return "Jamg'arish";
    case "avoid":
      return "Tavsiya etilmaydi";
    default:
      return "Bosqichli kutish";
  }
}

export function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 45) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
