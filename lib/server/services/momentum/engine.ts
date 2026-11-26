/**
 * Momentum portfeli (kesimli, volatillikka moslashtirilgan) — market-neutral savat.
 *
 * Har hafta (dushanba 00:00 UTC, kunlik sham yopilgach):
 * 1. Universe: 30 kunlik o'rtacha USDT hajmi bo'yicha top 100 kripto perpetual, ≥ 60 kun savdoda.
 * 2. Score = oxirgi L kunlik daromad / 30 kunlik kunlik volatillik (bir nechta L o'rtachasi).
 * 3. Eng yuqori `q` ulush — LONG, eng past `q` — SHORT; har tomon 50% kapital, teng vazn.
 *
 * Tadqiqot (`lib/server/scripts/research.ts`): 654 perpetual (136 ta delisting bo'lgani bilan),
 * 2022–2026, 0.07%/tomon xarajat. Lookback 14–90, q, rebalans kuni va 2× xarajat bo'yicha barqaror.
 * Faqat SAVAT sifatida ishlaydi — alohida long yoki short tomoni katta zarar ko'rgan.
 * Funding bilan: long tomon funding OLADI (+~25%/yil), lekin bu bir nechta short-squeeze
 * coinlarida to'plangan — tayanmaslik kerak; funding'siz Sharpe ~1.1, maxDD −33…−49%.
 */
export interface MomentumConfig {
  lookbacks: number[];
  volWindow: number;
  topN: number;
  minAgeDays: number;
  quantile: number;
}

export const MOMENTUM_CONFIG: MomentumConfig = {
  lookbacks: [14, 30, 60],
  volWindow: 30,
  topN: 100,
  minAgeDays: 60,
  quantile: 0.1,
};

/** Bitta coinning yopilgan kunlik shamlari (eskidan yangiga). */
export interface DailySeries {
  symbol: string;
  closes: number[];
  /** Kunlik USDT hajmi. */
  dollarVolumes: number[];
}

export interface BasketLeg {
  symbol: string;
  price: number;
  score: number;
  weight: number;
}

export interface Basket {
  longs: BasketLeg[];
  shorts: BasketLeg[];
  universe: number;
}

function dailyVol(closes: number[], window: number): number {
  const n = closes.length;
  if (n < window + 1) return NaN;
  let s = 0;
  let s2 = 0;
  for (let k = n - window; k < n; k++) {
    const r = Math.log(closes[k]! / closes[k - 1]!);
    s += r;
    s2 += r * r;
  }
  const m = s / window;
  return Math.sqrt(Math.max(s2 / window - m * m, 0));
}

export function momentumScore(closes: number[], config: MomentumConfig = MOMENTUM_CONFIG): number {
  const vol = dailyVol(closes, config.volWindow);
  if (!Number.isFinite(vol) || vol <= 0) return NaN;
  const last = closes.at(-1)!;
  const parts = config.lookbacks.map((L) => {
    const past = closes[closes.length - 1 - L];
    return past ? (last / past - 1) / vol : NaN;
  });
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

export function buildBasket(series: DailySeries[], config: MomentumConfig = MOMENTUM_CONFIG): Basket {
  const maxLookback = Math.max(...config.lookbacks);
  const eligible = series
    .filter((s) => s.closes.length >= Math.max(config.minAgeDays, maxLookback + 1, config.volWindow + 1))
    .map((s) => {
      const recent = s.dollarVolumes.slice(-30);
      return { s, avgVol: recent.reduce((a, b) => a + b, 0) / recent.length };
    })
    .sort((a, b) => b.avgVol - a.avgVol)
    .slice(0, config.topN)
    .map(({ s }) => ({ s, score: momentumScore(s.closes, config) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => b.score - a.score);

  const k = Math.max(1, Math.floor(eligible.length * config.quantile));
  if (eligible.length < 10) return { longs: [], shorts: [], universe: eligible.length };
  const leg = (x: (typeof eligible)[number]): BasketLeg => ({
    symbol: x.s.symbol,
    price: x.s.closes.at(-1)!,
    score: x.score,
    weight: 0.5 / k,
  });
  return {
    longs: eligible.slice(0, k).map(leg),
    shorts: eligible.slice(-k).reverse().map(leg),
    universe: eligible.length,
  };
}

/** Savatning narxlar bo'yicha daromadi (xarajatsiz): long +, short −. */
export function basketReturn(basket: Pick<Basket, "longs" | "shorts">, prices: Map<string, number>): number | null {
  let total = 0;
  let covered = 0;
  for (const [legs, sign] of [
    [basket.longs, 1],
    [basket.shorts, -1],
  ] as const) {
    for (const l of legs) {
      const p = prices.get(l.symbol);
      if (!p) continue; // delisting — hisobga olinmaydi
      total += sign * l.weight * (p / l.price - 1);
      covered += l.weight;
    }
  }
  return covered > 0 ? total : null;
}

/** Dushanba 00:00 UTC — shu hafta savatining kaliti. */
export function weekStart(now: number = Date.now()): Date {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // dushanba = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}
