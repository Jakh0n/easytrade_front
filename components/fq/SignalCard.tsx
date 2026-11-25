import Link from "next/link";
import type { FqScanCoin } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { pairLabel, pctChange, signed } from "@/lib/fq";
import { SideTag, Tag } from "./primitives";
import { RLadder } from "./RLadder";

function Level({ label, price, entry, tone }: { label: string; price: number; entry: number; tone?: "long" | "short" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="num truncate text-sm font-medium">{formatPrice(price)}</dd>
      {tone && (
        <dd className={tone === "long" ? "num text-[11px] text-long" : "num text-[11px] text-short"}>
          {signed(pctChange(entry, price))}
        </dd>
      )}
    </div>
  );
}

export function SignalCard({ coin }: { coin: FqScanCoin }) {
  if (!coin.side) return null;
  const fresh = coin.signalBarsAgo === 0;

  return (
    <Link
      href={`/coin/${coin.symbol}?market=${coin.marketType}`}
      className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{pairLabel(coin.symbol)}</span>
            <span className="text-xs text-muted-foreground">/USDT</span>
            <SideTag side={coin.side} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Tag tone="muted">{coin.setup === "breakout" ? "Breakout" : "Pullback"}</Tag>
            <Tag tone={fresh ? "warn" : "muted"}>
              {fresh && <span className="size-1.5 animate-pulse rounded-full bg-warn" aria-hidden />}
              {fresh ? "Hozirgi sham" : `${coin.signalBarsAgo} sham oldin`}
            </Tag>
          </div>
        </div>
        <div className="text-right">
          <p className="num text-sm font-medium">{formatPrice(coin.currentPrice)}</p>
          <p className={coin.priceChangePercent >= 0 ? "num text-xs text-long" : "num text-xs text-short"}>
            {signed(coin.priceChangePercent)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-4 gap-3">
        <Level label="Kirish" price={coin.entry} entry={coin.entry} />
        <Level label="Stop" price={coin.stopLoss} entry={coin.entry} tone="short" />
        <Level label="TP1" price={coin.tp1} entry={coin.entry} tone="long" />
        <Level label="TP2" price={coin.tp2} entry={coin.entry} tone="long" />
      </dl>

      <RLadder
        className="mt-4"
        side={coin.side}
        entry={coin.entry}
        stopLoss={coin.stopLoss}
        tp1={coin.tp1}
        tp2={coin.tp2}
        price={coin.currentPrice}
      />

      <div className="num mt-3 flex gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>ADX {coin.indicators.adx.toFixed(1)}</span>
        <span>RSI {coin.indicators.rsi.toFixed(0)}</span>
        <span>4H {coin.htfBias === "bullish" ? "↑" : coin.htfBias === "bearish" ? "↓" : "—"}</span>
        <span className="ml-auto text-foreground">{coin.score}/100</span>
      </div>
    </Link>
  );
}
