"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EquityPoint } from "@/lib/api";
import { formatUsd } from "@/lib/format";

export function EquityCurveChart({ data }: { data: EquityPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-border/60 text-sm text-muted-foreground">
        Yopilgan savdolar yo&apos;q — equity egri chizig&apos;i bo&apos;sh
      </div>
    );
  }

  const chartData = data.map((point, index) => ({
    index: index + 1,
    pnl: point.cumulativePnl,
  }));

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="mb-3 text-sm font-medium">Equity egri chizig&apos;i</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ left: 4, right: 8, top: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="index"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            width={56}
            tickFormatter={(value: number) => formatUsd(value)}
          />
          <Tooltip
            formatter={(value) => [formatUsd(Number(value)), "Cumulative P&L"]}
            labelFormatter={(label) => `Savdo #${label}`}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="pnl"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
