"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FqScanCoin } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { pairLabel, signed } from "@/lib/fq";
import { cn } from "@/lib/utils";
import { SideTag, TrendIcon } from "./primitives";

type SortKey = "score" | "adx" | "change" | "volume";

const SORTERS: Record<SortKey, (c: FqScanCoin) => number> = {
  score: (c) => c.score,
  adx: (c) => c.indicators.adx,
  change: (c) => c.priceChangePercent,
  volume: (c) => c.quoteVolume,
};

function statusText(coin: FqScanCoin): string {
  if (coin.signalBarsAgo !== null) return `Signal ${coin.signalBarsAgo} sham oldin`;
  if (coin.trend === "up") return "Pullback / breakout kutilmoqda";
  if (coin.trend === "down") return "Pullback / breakdown kutilmoqda";
  return "Trend shakllanmoqda";
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = active === sortKey;
  const Icon = !isActive ? ChevronsUpDown : dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === "desc" ? "descending" : "ascending") : "none"}
      className={cn("px-3 py-2 text-right font-medium", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex cursor-pointer items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </th>
  );
}

export function WatchTable({ coins }: { coins: FqScanCoin[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const factor = dir === "desc" ? -1 : 1;
    return [...coins].sort((a, b) => factor * (SORTERS[sortKey](a) - SORTERS[sortKey](b)));
  }, [coins, sortKey, dir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setDir(dir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDir("desc");
    }
  };

  const open = (coin: FqScanCoin) => router.push(`/coin/${coin.symbol}?market=${coin.marketType}`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Kuzatuvdagi coinlar — FQ v3 shartlari qisman bajarilgan</caption>
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Coin</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">Yo&apos;nalish</th>
            <th scope="col" className="hidden px-3 py-2 text-left font-medium lg:table-cell">Holat</th>
            <SortHeader label="Ball" sortKey="score" active={sortKey} dir={dir} onSort={onSort} />
            <SortHeader label="ADX" sortKey="adx" active={sortKey} dir={dir} onSort={onSort} className="hidden sm:table-cell" />
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">RSI</th>
            <SortHeader label="24s" sortKey="change" active={sortKey} dir={dir} onSort={onSort} />
            <th scope="col" className="px-3 py-2 text-right font-medium">Narx</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((coin) => (
            <tr
              key={coin.symbol}
              onClick={() => open(coin)}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <td className="px-3 py-2.5">
                <a
                  href={`/coin/${coin.symbol}?market=${coin.marketType}`}
                  onClick={(e) => {
                    e.preventDefault();
                    open(coin);
                  }}
                  className="inline-flex items-center gap-1.5 font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <TrendIcon trend={coin.trend} />
                  {pairLabel(coin.symbol)}
                </a>
              </td>
              <td className="px-3 py-2.5">
                <SideTag side={coin.side} />
              </td>
              <td className="hidden max-w-64 truncate px-3 py-2.5 text-muted-foreground lg:table-cell">
                {statusText(coin)}
              </td>
              <td className="num px-3 py-2.5 text-right">
                <span className={coin.score >= 80 ? "text-foreground" : "text-muted-foreground"}>{coin.score}</span>
              </td>
              <td className="num hidden px-3 py-2.5 text-right sm:table-cell">{coin.indicators.adx.toFixed(1)}</td>
              <td className="num hidden px-3 py-2.5 text-right sm:table-cell">{coin.indicators.rsi.toFixed(0)}</td>
              <td className={cn("num px-3 py-2.5 text-right", coin.priceChangePercent >= 0 ? "text-long" : "text-short")}>
                {signed(coin.priceChangePercent)}
              </td>
              <td className="num px-3 py-2.5 text-right">{formatPrice(coin.currentPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
