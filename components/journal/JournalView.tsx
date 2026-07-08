"use client";

import { BookOpen, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { useJournalStats, useTrades } from "@/hooks/useJournal";
import { formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { EquityCurveChart } from "./EquityCurveChart";
import { NewTradeForm } from "./NewTradeForm";
import { TradesTable } from "./TradesTable";

export function JournalView() {
  const { data: trades = [], isLoading } = useTrades();
  const { data: stats } = useJournalStats();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Savdo jurnali"
        description="Savdolaringizni kuzating va statistikani tahlil qiling"
        action={
          <Button size="sm" onClick={() => setShowForm((prev) => !prev)}>
            <Plus className="size-4" />
            Yangi savdo
          </Button>
        }
      />

      {showForm && <NewTradeForm onClose={() => setShowForm(false)} />}

      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Jami P&L"
            value={formatUsd(stats.totalPnl)}
            accent={stats.totalPnl >= 0 ? "green" : "red"}
            hint={`${stats.closedTrades} yopilgan savdo`}
          />
          <StatCard
            label="Win rate"
            value={formatPercent(stats.winRate)}
            hint={`${stats.wins}W / ${stats.losses}L`}
          />
          <StatCard
            label="O'rtacha R"
            value={formatNumber(stats.avgR)}
            accent={stats.avgR >= 0 ? "green" : "red"}
          />
          <StatCard
            label="Ochiq savdolar"
            value={String(stats.openTrades)}
          />
        </div>
      )}

      {stats && (
        <div className="mb-5">
          <EquityCurveChart data={stats.equityCurve} />
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && trades.length === 0 && (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title="Jurnal bo'sh"
          description="Birinchi savdongizni qo'shing yoki tahlildan saqlang."
        />
      )}

      {trades.length > 0 && <TradesTable trades={trades} />}
    </div>
  );
}
