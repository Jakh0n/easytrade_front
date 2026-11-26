import { calculateEMA } from "../indicators.service";
import type { Candle } from "../../types/index";

/**
 * Bozor rejimi — TradingView'dagi CRYPTOCAP indekslarining Binance shamlaridan hisoblangan proxy'lari.
 *
 * - ALT  (≈ TOTAL3): BTC va ETH'siz likvid altlar savati — teng vaznli log-daromad indeksi.
 * - ALT2 (≈ TOTAL2): xuddi shu savat + ETH.
 * - DOM  (≈ BTC.D):  log(BTC) − ALT. Ko'tarilsa BTC altlardan kuchli (pul BTC'ga qochyapti).
 * - BREADTH: savatdagi coinlarning necha foizi o'z EMA'sidan yuqori.
 * USDT.D alohida hisoblanmaydi — u TOTAL'ga deyarli teskari yuradi, ALT/ALT2 bu signalni qamraydi.
 *
 * Har bir qator yopilgan shamga tegishli (closeTime) — signal shu paytgacha yopilgan oxirgi qatorni oladi.
 */

/** Indeks savati: BTC/ETH'siz, uzoq tarixli likvid altlar (survivorship bias'ni kamaytirish uchun qat'iy ro'yxat). */
export const REGIME_ALT_BASKET = [
  "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "DOTUSDT",
  "LTCUSDT", "BCHUSDT", "NEARUSDT", "UNIUSDT", "AAVEUSDT", "ATOMUSDT", "FILUSDT", "ETCUSDT",
  "SUIUSDT", "TRXUSDT", "XLMUSDT", "HBARUSDT",
] as const;

export const REGIME_EMA_LEN = 200;

export interface RegimeBar {
  closeTime: number;
  btcUp: boolean | null;
  ethUp: boolean | null;
  /** ALT (≈ TOTAL3) o'z EMA'sidan yuqori. */
  altUp: boolean | null;
  /** ALT2 (≈ TOTAL2) o'z EMA'sidan yuqori. */
  alt2Up: boolean | null;
  /** DOM (≈ BTC.D) o'z EMA'sidan yuqori — BTC altlardan kuchli. */
  domUp: boolean | null;
  /** Savatdagi coinlarning EMA'dan yuqoridagi ulushi (0–1). */
  breadth: number | null;
}

/** Teng vaznli log-daromad indeksi: har shamda mavjud coinlar o'rtacha log-daromadining yig'indisi. */
function equalWeightIndex(series: Candle[][], times: number[]): number[] {
  const maps = series.map((candles) => new Map(candles.map((c) => [c.openTime, c.close])));
  const prev: (number | undefined)[] = series.map(() => undefined);
  const out: number[] = [];
  let value = 0;
  for (const t of times) {
    let sum = 0;
    let n = 0;
    maps.forEach((m, i) => {
      const close = m.get(t);
      if (close === undefined || !(close > 0)) return;
      const p = prev[i];
      if (p !== undefined) {
        sum += Math.log(close / p);
        n += 1;
      }
      prev[i] = close;
    });
    if (n) value += sum / n;
    out.push(value);
  }
  return out;
}

function aboveEma(values: number[], len: number): (boolean | null)[] {
  const ema = values.length ? calculateEMA(values, len) : [];
  return values.map((v, i) => (Number.isFinite(ema[i]!) ? v > ema[i]! : null));
}

/**
 * Bir xil timeframe'dagi shamlardan rejim qatorlarini quradi.
 * `alts` — REGIME_ALT_BASKET (yoki boshqa savat) shamlari; BTC va ETH alohida.
 */
export function computeRegime(
  btc: Candle[],
  eth: Candle[],
  alts: Candle[][],
  emaLen: number = REGIME_EMA_LEN,
): RegimeBar[] {
  if (!btc.length) return [];
  // Vaqt o'qi BTC bo'yicha (eng uzun tarix, bo'shliqsiz).
  const times = btc.map((c) => c.openTime);
  const btcClose = btc.map((c) => c.close);
  const ethMap = new Map(eth.map((c) => [c.openTime, c.close]));

  const alt = equalWeightIndex(alts, times);
  const alt2 = equalWeightIndex([...alts, eth], times);
  const dom = btcClose.map((c, i) => Math.log(c) - alt[i]!);

  const btcUp = aboveEma(btcClose, emaLen);
  const altUp = aboveEma(alt, emaLen);
  const alt2Up = aboveEma(alt2, emaLen);
  const domUp = aboveEma(dom, emaLen);

  // ETH: bo'shliqlarni oldingi close bilan to'ldiramiz (ETH tarixi BTC bilan deyarli bir xil).
  let lastEth = NaN;
  const ethClose = times.map((t) => (lastEth = ethMap.get(t) ?? lastEth));
  const ethFirst = ethClose.findIndex(Number.isFinite);
  const ethUpRaw = ethFirst >= 0 ? aboveEma(ethClose.slice(ethFirst), emaLen) : [];
  const ethUp = times.map((_, i) => (i < ethFirst || ethFirst < 0 ? null : ethUpRaw[i - ethFirst]!));

  // Breadth: har coin o'z EMA'sidan yuqorimi.
  const perCoin = alts.map((candles) => {
    const flags = aboveEma(candles.map((c) => c.close), emaLen);
    return new Map(candles.map((c, i) => [c.openTime, flags[i]!]));
  });

  return btc.map((c, i) => {
    let above = 0;
    let known = 0;
    for (const m of perCoin) {
      const f = m.get(c.openTime);
      if (f === null || f === undefined) continue;
      known += 1;
      if (f) above += 1;
    }
    return {
      closeTime: c.closeTime,
      btcUp: btcUp[i]!,
      ethUp: ethUp[i]!,
      altUp: altUp[i]!,
      alt2Up: alt2Up[i]!,
      domUp: domUp[i]!,
      breadth: known >= 5 ? above / known : null,
    };
  });
}

/**
 * Filtr qoidalari (backtest bilan tanlanadi):
 * - off     — filtr yo'q
 * - btc     — LONG faqat BTC EMA'dan yuqori, SHORT faqat past bo'lsa
 * - alt     — ALT (≈ TOTAL3) bo'yicha
 * - alt2    — ALT2 (≈ TOTAL2) bo'yicha
 * - both    — BTC va ALT ikkalasi bir tomonda bo'lsa
 * - dom     — altlar uchun: LONG = ALT yuqori va BTC.D past (alt season), SHORT = ALT past yoki BTC.D yuqori;
 *             BTC/ETH uchun — o'z (BTC / ETH) trendi
 * - breadth — LONG: savatning >50% EMA'dan yuqori, SHORT: <50%
 * - veto    — faqat qarama-qarshi aniq rejimda bloklaydi: BTC va ALT ikkalasi past bo'lsa LONG yo'q,
 *             ikkalasi yuqori bo'lsa SHORT yo'q (aralash rejimda hammasi ruxsat)
 */
export const REGIME_RULES = ["off", "btc", "alt", "alt2", "both", "dom", "breadth", "veto"] as const;
export type RegimeRule = (typeof REGIME_RULES)[number];

export function regimeAllows(
  rule: RegimeRule,
  bar: RegimeBar | null | undefined,
  side: "long" | "short",
  symbol: string,
): boolean {
  if (rule === "off") return true;
  // Rejim ma'lumoti yo'q (isish davri) — bloklamaymiz.
  if (!bar) return true;
  const long = side === "long";
  const ok = (flag: boolean | null) => flag === null || flag === long;

  switch (rule) {
    case "btc":
      return ok(bar.btcUp);
    case "alt":
      return ok(bar.altUp);
    case "alt2":
      return ok(bar.alt2Up);
    case "both":
      return ok(bar.btcUp) && ok(bar.altUp);
    case "dom":
      if (symbol === "BTCUSDT") return ok(bar.btcUp);
      if (symbol === "ETHUSDT") return ok(bar.ethUp);
      if (bar.altUp === null || bar.domUp === null) return true;
      return long ? bar.altUp && !bar.domUp : !bar.altUp || bar.domUp;
    case "breadth":
      return bar.breadth === null || (long ? bar.breadth > 0.5 : bar.breadth < 0.5);
    case "veto":
      if (bar.btcUp === null || bar.altUp === null) return true;
      return long ? bar.btcUp || bar.altUp : !(bar.btcUp && bar.altUp);
  }
}

/** `time` paytgacha yopilgan oxirgi rejim qatori (binary search). */
export function regimeAt(bars: RegimeBar[], time: number): RegimeBar | null {
  let lo = 0;
  let hi = bars.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.closeTime <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? bars[found]! : null;
}

/** Telegram / UI uchun qisqa tavsif. */
export function describeRegime(bar: RegimeBar | null): string {
  if (!bar) return "Bozor rejimi: ma'lumot yo'q";
  const arrow = (f: boolean | null) => (f === null ? "—" : f ? "▲" : "▼");
  const breadth = bar.breadth === null ? "—" : `${Math.round(bar.breadth * 100)}%`;
  return `BTC ${arrow(bar.btcUp)} · TOTAL3 ${arrow(bar.altUp)} · BTC.D ${arrow(bar.domUp)} · breadth ${breadth}`;
}
