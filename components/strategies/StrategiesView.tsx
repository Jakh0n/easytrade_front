"use client";

import { ArrowRight, CheckCircle2, Layers } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { fetchStrategies } from "@/lib/api";

export function StrategiesView() {
  const { data, isLoading } = useQuery({
    queryKey: ["strategies"],
    queryFn: fetchStrategies,
    staleTime: 60 * 60_000,
  });

  const strategies = data?.strategies ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Strategiyalar"
        description="Avtomatlashtirilgan savdo strategiyalari — har bir strategiya bo'yicha coinlarni saralash"
      />

      {isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Strategiyalar yuklanmoqda...
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {strategies.map((strategy) => (
          <Link
            key={strategy.id}
            href={`/strategies/${strategy.id}`}
            className="group rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/20"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Layers className="size-5" />
                </div>
                <div>
                  <h2 className="font-semibold">{strategy.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {strategy.timeframes}
                  </p>
                </div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {strategy.description}
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {strategy.checklist.slice(0, 3).map((item) => (
                <Badge key={item} variant="outline" className="text-xs font-normal">
                  <CheckCircle2 className="mr-1 size-3" />
                  {item}
                </Badge>
              ))}
              {strategy.checklist.length > 3 && (
                <Badge variant="outline" className="text-xs font-normal">
                  +{strategy.checklist.length - 3}
                </Badge>
              )}
            </div>

            <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
              <span>Risk: {strategy.riskPercent}%</span>
              <span>Min R:R 1:{strategy.minRiskReward}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
