import { DAY_MS, type Panel } from "./data";

/**
 * Kunlik portfel simulyatori. d-kun yopilishida (faqat d gacha bo'lgan ma'lumot bilan) maqsad
 * vaznlari hisoblanadi, pozitsiya d → d+1 yopilishigacha ushlanadi.
 * - Xarajat: savdo qilingan notional × `cost` (taker + slippage, bir tomon).
 * - Funding: long musbat fundingni to'laydi, short oladi (`funding[d+1]` — shu oraliqdagi jami).
 * - Delisting: coin ma'lumoti tugasa — oxirgi close'da chiqiladi.
 */
export interface UniverseOptions {
  /** 30 kunlik o'rtacha USDT hajmi bo'yicha top N. */
  topN: number;
  /** Shuncha kundan kam savdoda bo'lgan coinlar olinmaydi. */
  minAgeDays: number;
}

export interface Ctx {
  panel: Panel;
  d: number;
  universe: number[];
  firstDay: Int32Array;
}

/** Vaznlar: musbat — long, manfiy — short. sum|w| ≤ 1 (gross). */
export type Strategy = (ctx: Ctx) => Map<number, number>;

export interface SimOptions {
  rebalanceEvery: number;
  cost: number;
  useFunding: boolean;
  universe: UniverseOptions;
  /** Rebalans kuni ofseti (haftaning kuni ta'sirini tekshirish uchun). */
  offset?: number;
}

export interface SimResult {
  days: number[];
  returns: Float64Array;
  turnover: number;
  fundingPaid: number;
}

const DEFAULT_UNIVERSE: UniverseOptions = { topN: 100, minAgeDays: 60 };

export function firstDays(panel: Panel): Int32Array {
  const n = panel.symbols.length;
  const first = new Int32Array(n).fill(-1);
  for (let d = 0; d < panel.days.length; d++) {
    const row = panel.close[d]!;
    for (let i = 0; i < n; i++) if (first[i] === -1 && Number.isFinite(row[i]!)) first[i] = d;
  }
  return first;
}

/** 30 kunlik o'rtacha hajmning prefiks yig'indisi — universe tez tanlanadi. */
const STABLE = /^(USDC|FDUSD|TUSD|BUSD|USDP|DAI|USDE|XUSD|EUR|PAXG|XAUT)USDT$/;

export function universeAt(panel: Panel, d: number, first: Int32Array, opts: UniverseOptions = DEFAULT_UNIVERSE): number[] {
  const n = panel.symbols.length;
  const scored: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (STABLE.test(panel.symbols[i]!)) continue;
    if (!Number.isFinite(panel.close[d]![i]!) || first[i]! < 0 || d - first[i]! < opts.minAgeDays) continue;
    let sum = 0;
    let cnt = 0;
    for (let k = Math.max(0, d - 29); k <= d; k++) {
      const v = panel.dollarVol[k]![i]!;
      if (Number.isFinite(v)) {
        sum += v;
        cnt += 1;
      }
    }
    if (cnt >= 20) scored.push([i, sum / cnt]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, opts.topN).map(([i]) => i);
}

export function simulate(panel: Panel, strategy: Strategy, opts: SimOptions): SimResult {
  const D = panel.days.length;
  const first = firstDays(panel);
  const returns = new Float64Array(D).fill(0);
  let weights = new Map<number, number>();
  let turnover = 0;
  let fundingPaid = 0;
  const offset = opts.offset ?? 0;
  const warmup = 90;

  for (let d = warmup; d < D - 1; d++) {
    // Delisting: ma'lumoti tugagan coin pozitsiyadan chiqadi (oxirgi close'da).
    for (const [i] of weights) if (!Number.isFinite(panel.close[d]![i]!)) weights.delete(i);

    if ((d - warmup - offset) % opts.rebalanceEvery === 0) {
      const universe = universeAt(panel, d, first, opts.universe);
      const target = strategy({ panel, d, universe, firstDay: first });
      let traded = 0;
      for (const [i, w] of target) traded += Math.abs(w - (weights.get(i) ?? 0));
      for (const [i, w] of weights) if (!target.has(i)) traded += Math.abs(w);
      turnover += traded;
      returns[d + 1]! -= traded * opts.cost;
      weights = target;
    }

    let pnl = 0;
    for (const [i, w] of weights) {
      const c0 = panel.close[d]![i]!;
      const c1 = panel.close[d + 1]![i]!;
      if (Number.isFinite(c1)) pnl += w * (c1 / c0 - 1);
      if (opts.useFunding && panel.funding) {
        const f = panel.funding[d + 1]![i]!;
        pnl -= w * f;
        fundingPaid += w * f;
      }
    }
    returns[d + 1]! += pnl;
  }
  return { days: panel.days, returns, turnover, fundingPaid };
}

export interface Metrics {
  cagr: number;
  vol: number;
  sharpe: number;
  maxDd: number;
  byYear: Record<string, number>;
}

export function metrics(days: number[], returns: Float64Array, from: number = 0, to: number = Infinity): Metrics {
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const byYear: Record<string, number> = {};
  for (let d = 0; d < days.length; d++) {
    if (days[d]! < from || days[d]! >= to) continue;
    const r = returns[d]!;
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, 1 - equity / peak);
    sum += r;
    sumSq += r * r;
    n += 1;
    const y = String(new Date(days[d]!).getUTCFullYear());
    byYear[y] = (1 + (byYear[y] ?? 0)) * (1 + r) - 1;
  }
  const mean = n ? sum / n : 0;
  const sd = n > 1 ? Math.sqrt(sumSq / n - mean * mean) : 0;
  return {
    cagr: n ? equity ** (365 / n) - 1 : 0,
    vol: sd * Math.sqrt(365),
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(365) : 0,
    maxDd,
    byYear,
  };
}

// ───────────── Strategiyalar ─────────────

function ret(panel: Panel, i: number, d: number, lookback: number): number {
  const a = panel.close[d - lookback]?.[i];
  const b = panel.close[d]![i]!;
  return a && Number.isFinite(a) ? b / a - 1 : NaN;
}

export function realizedVol(panel: Panel, i: number, d: number, window: number): number {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let k = d - window + 1; k <= d; k++) {
    const a = panel.close[k - 1]?.[i];
    const b = panel.close[k]?.[i];
    if (!a || !b || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    const r = Math.log(b / a);
    s += r;
    s2 += r * r;
    n += 1;
  }
  if (n < window * 0.7) return NaN;
  const m = s / n;
  return Math.sqrt(Math.max(s2 / n - m * m, 0));
}

/** Score bo'yicha long top `q`, short bottom `q` (har tomon 0.5 gross, teng vazn). */
export function longShort(scores: [number, number][], q: number, sides: "both" | "long" | "short" = "both"): Map<number, number> {
  const valid = scores.filter(([, s]) => Number.isFinite(s)).sort((a, b) => b[1] - a[1]);
  const k = Math.max(1, Math.floor(valid.length * q));
  const out = new Map<number, number>();
  if (valid.length < 10) return out;
  const longW = sides === "both" ? 0.5 / k : sides === "long" ? 1 / k : 0;
  const shortW = sides === "both" ? 0.5 / k : sides === "short" ? 1 / k : 0;
  if (longW) for (const [i] of valid.slice(0, k)) out.set(i, longW);
  if (shortW) for (const [i] of valid.slice(-k)) out.set(i, -shortW);
  return out;
}

export const strategies = {
  /** Kesimli momentum: oxirgi L kunda eng ko'p o'sganlar long, eng ko'p tushganlar short. */
  xsMom: (lookback: number, q = 0.2, skip = 0): Strategy => ({ panel, d, universe }) =>
    longShort(universe.map((i) => [i, ret(panel, i, d - skip, lookback - skip)]), q),

  /** Kesimli momentum, volatillikka bo'lingan (risk-adjusted). */
  xsMomVolAdj: (lookback: number, q = 0.2): Strategy => ({ panel, d, universe }) =>
    longShort(universe.map((i) => [i, ret(panel, i, d, lookback) / realizedVol(panel, i, d, 30)]), q),

  /** Qisqa muddatli qaytish (reversal). */
  xsRev: (lookback: number, q = 0.2): Strategy => ({ panel, d, universe }) =>
    longShort(universe.map((i) => [i, -ret(panel, i, d, lookback)]), q),

  /** Past volatillik long, yuqori volatillik short. */
  lowVol: (window = 30, q = 0.2): Strategy => ({ panel, d, universe }) =>
    longShort(universe.map((i) => [i, -realizedVol(panel, i, d, window)]), q),

  /** Funding carry: funding eng manfiy (short to'laydi) — long, eng musbat — short. */
  carry: (window = 7, q = 0.2): Strategy => ({ panel, d, universe }) =>
    longShort(
      universe.map((i) => {
        let s = 0;
        for (let k = d - window + 1; k <= d; k++) s += panel.funding?.[k]?.[i] ?? 0;
        return [i, -s];
      }),
      q,
    ),

  /** Yangi listing: eski coinlar long, yangilar (60–365 kun) short. */
  age: (q = 0.2): Strategy => ({ d, universe, firstDay }) =>
    longShort(universe.map((i) => [i, d - firstDay[i]!]), q),

  /**
   * Vaqt qatori trendi: har coin o'z L kunlik daromadi ishorasi bo'yicha long/short,
   * vazn 1/volatillik (har coin riskga teng hissa qo'shadi). `btcFilter`: BTC trendiga qarshi tomon o'chiq.
   */
  tsTrend: (lookback: number, opts: { longOnly?: boolean; btcFilter?: boolean } = {}): Strategy => ({ panel, d, universe }) => {
    const btc = panel.symbols.indexOf("BTCUSDT");
    const btcUp = btc >= 0 ? ret(panel, btc, d, lookback) > 0 : true;
    const raw: [number, number][] = [];
    for (const i of universe) {
      const r = ret(panel, i, d, lookback);
      const v = realizedVol(panel, i, d, 30);
      if (!Number.isFinite(r) || !Number.isFinite(v) || v <= 0) continue;
      let s = Math.sign(r);
      if (opts.longOnly && s < 0) s = 0;
      if (opts.btcFilter && ((btcUp && s < 0) || (!btcUp && s > 0))) s = 0;
      if (s !== 0) raw.push([i, s / v]);
    }
    const gross = raw.reduce((a, [, w]) => a + Math.abs(w), 0);
    return new Map(gross > 0 ? raw.map(([i, w]) => [i, w / gross]) : []);
  },

  /** Taqqoslash uchun: BTC'ni sotib olib ushlash. */
  btcHold: (): Strategy => ({ panel }) => {
    const btc = panel.symbols.indexOf("BTCUSDT");
    return new Map([[btc, 1]]);
  },

  /** Bir nechta strategiyaning o'rtachasi (gross normallashtirilgan). */
  blend: (...parts: Strategy[]): Strategy => (ctx) => {
    const sum = new Map<number, number>();
    for (const p of parts) for (const [i, w] of p(ctx)) sum.set(i, (sum.get(i) ?? 0) + w / parts.length);
    return sum;
  },
};

export const YEAR_MS = 365 * DAY_MS;
