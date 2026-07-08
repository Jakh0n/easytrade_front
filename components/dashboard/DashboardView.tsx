"use client";

import { Bell, LineChart, Radar, Star } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { useAlerts } from "@/hooks/useAlerts";
import { useJournalStats } from "@/hooks/useJournal";
import { useWatchlist } from "@/hooks/useWatchlist";
import { formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { useAuthStore } from "@/lib/store/auth";

const QUICK_LINKS = [
  {
    href: "/screener",
    label: "Bozor skaneri",
    description: "Faol signallarni toping",
    icon: Radar,
  },
  {
    href: "/analyze",
    label: "Tahlil",
    description: "Coin bo'yicha to'liq signal",
    icon: LineChart,
  },
] as const;

export function DashboardView() {
  const user = useAuthStore((state) => state.user);
  const { data: stats } = useJournalStats();
  const { data: watchlist = [] } = useWatchlist();
  const { data: alerts = [] } = useAlerts();

  const activeAlerts = alerts.filter((alert) => alert.status === "active").length;

  return (
    <div>
      <PageHeader
        title={`Salom, ${user?.name ?? "Trader"}`}
        description="Trading faoliyatingizning umumiy ko'rinishi"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jami P&L"
          value={stats ? formatUsd(stats.totalPnl) : "—"}
          accent={stats && stats.totalPnl >= 0 ? "green" : "red"}
        />
        <StatCard
          label="Win rate"
          value={stats ? formatPercent(stats.winRate) : "—"}
          hint={stats ? `${stats.wins}W / ${stats.losses}L` : undefined}
        />
        <StatCard
          label="O'rtacha R"
          value={stats ? formatNumber(stats.avgR) : "—"}
        />
        <StatCard label="Faol ogohlantirish" value={String(activeAlerts)} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="font-medium">{link.label}</p>
                <p className="text-sm text-muted-foreground">
                  {link.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Star className="size-4" />
              Watchlist
            </p>
            <Button variant="ghost" size="sm" render={<Link href="/watchlist" />}>
              Barchasi
            </Button>
          </div>
          {watchlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ro&apos;yxat bo&apos;sh</p>
          ) : (
            <ul className="space-y-1.5">
              {watchlist.slice(0, 5).map((item) => (
                <li
                  key={item._id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">{item.symbol}</span>
                  <Link
                    href={`/analyze?symbol=${item.symbol}&marketType=${item.marketType}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Tahlil
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Bell className="size-4" />
              So&apos;nggi ogohlantirishlar
            </p>
            <Button variant="ghost" size="sm" render={<Link href="/alerts" />}>
              Barchasi
            </Button>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ogohlantirishlar yo&apos;q
            </p>
          ) : (
            <ul className="space-y-1.5">
              {alerts.slice(0, 5).map((alert) => (
                <li
                  key={alert._id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">{alert.symbol}</span>
                  <span className="text-xs text-muted-foreground">
                    {alert.status === "triggered" ? "Ishga tushdi" : "Faol"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
