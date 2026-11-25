import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RLadderProps {
  side: "long" | "short";
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  price?: number;
  className?: string;
}

/**
 * SL → Kirish → TP1 → TP2 ni bitta o'qda R birligida ko'rsatadi
 * (chap = stop, o'ng = TP2, yo'nalishdan qat'i nazar). Joriy narx nuqta bilan.
 */
export function RLadder({ side, entry, stopLoss, tp1, tp2, price, className }: RLadderProps) {
  const risk = Math.abs(entry - stopLoss);
  if (risk <= 0) return null;
  const d = side === "long" ? 1 : -1;
  const toR = (p: number) => (d * (p - entry)) / risk;
  const minR = -1;
  const maxR = Math.max(toR(tp2), 1);
  const span = maxR - minR;
  const pos = (r: number) => `${((Math.min(Math.max(r, minR), maxR) - minR) / span) * 100}%`;
  const priceR = price !== undefined ? toR(price) : null;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="relative h-2 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-short/35" style={{ width: pos(0) }} />
        <div
          className="absolute inset-y-0 rounded-r-full bg-long/35"
          style={{ left: pos(0), right: 0 }}
        />
        {[0, toR(tp1)].map((r) => (
          <span key={r} className="absolute inset-y-[-3px] w-px bg-foreground/60" style={{ left: pos(r) }} />
        ))}
        {priceR !== null && (
          <span
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
            style={{ left: pos(priceR) }}
          />
        )}
      </div>
      <div className="num flex justify-between text-[10px] text-muted-foreground">
        <span>SL −1R</span>
        <span>Kirish</span>
        <span>TP1 {toR(tp1).toFixed(1)}R</span>
        <span>TP2 {toR(tp2).toFixed(1)}R</span>
      </div>
      {priceR !== null && price !== undefined && (
        <p className="sr-only">
          Joriy narx {formatPrice(price)}, {priceR.toFixed(2)}R
        </p>
      )}
    </div>
  );
}
