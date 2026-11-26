import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import type { Candle } from "../../types/index";

/**
 * Tadqiqot ma'lumotlari: Binance USDT perpetual'larning HAMMASI (delisting bo'lganlari ham —
 * aks holda "omon qolganlar" xatosi natijani bo'rttiradi). Kunlik shamlar va funding diskka
 * keshlanadi: `.cache/research/`.
 */
const FAPI = "https://fapi.binance.com";
export const RESEARCH_START = Date.UTC(2022, 0, 1);
export const DAY_MS = 86_400_000;
const CACHE = path.join(process.cwd(), ".cache", "research");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function listPerpetuals(): Promise<string[]> {
  const { data } = await axios.get<{
    symbols: { symbol: string; quoteAsset: string; contractType: string; underlyingType?: string; status: string }[];
  }>(`${FAPI}/fapi/v1/exchangeInfo`, { timeout: 20_000 });
  return data.symbols
    .filter(
      (s) =>
        s.quoteAsset === "USDT" &&
        s.contractType === "PERPETUAL" &&
        s.underlyingType === "COIN" &&
        (s.status === "TRADING" || s.status === "SETTLING"),
    )
    .map((s) => s.symbol);
}

async function getWithRetry<T>(url: string, params: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { data } = await axios.get<T>(url, { params, timeout: 20_000 });
      return data;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (attempt >= 4 || (status && status < 429 && status !== 408)) throw error;
      await sleep(status === 429 || status === 418 ? 60_000 : 2_000 * (attempt + 1));
    }
  }
}

type RawKline = [number, string, string, string, string, string, number, string];

export async function downloadDaily(symbol: string): Promise<void> {
  const out: Candle[] = [];
  let cursor = RESEARCH_START;
  const end = Date.now();
  while (cursor < end) {
    const page = await getWithRetry<RawKline[]>(`${FAPI}/fapi/v1/klines`, {
      symbol,
      interval: "1d",
      startTime: cursor,
      endTime: end,
      limit: 1500,
    });
    if (!page.length) break;
    for (const k of page) {
      out.push({
        openTime: k[0],
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        // Kotirovka hajmi (USDT) — likvidlik filtri uchun.
        volume: Number(k[7]),
        closeTime: k[6],
      });
    }
    cursor = page.at(-1)![0] + DAY_MS;
    if (page.length < 1500) break;
  }
  await mkdir(path.join(CACHE, "1d"), { recursive: true });
  await writeFile(path.join(CACHE, "1d", `${symbol}.json`), JSON.stringify(out.filter((c) => c.closeTime <= end)));
}

export async function downloadFunding(symbol: string): Promise<void> {
  const out: { t: number; r: number }[] = [];
  let cursor = RESEARCH_START;
  const end = Date.now();
  while (cursor < end) {
    const page = await getWithRetry<{ fundingTime: number; fundingRate: string }[]>(`${FAPI}/fapi/v1/fundingRate`, {
      symbol,
      startTime: cursor,
      endTime: end,
      limit: 1000,
    });
    if (!page.length) break;
    for (const f of page) out.push({ t: f.fundingTime, r: Number(f.fundingRate) });
    cursor = page.at(-1)!.fundingTime + 1;
    if (page.length < 1000) break;
    await sleep(700); // fundingRate: 500 so'rov / 5 daqiqa
  }
  await mkdir(path.join(CACHE, "funding"), { recursive: true });
  await writeFile(path.join(CACHE, "funding", `${symbol}.json`), JSON.stringify(out));
}

export async function cachedSymbols(kind: "1d" | "funding"): Promise<string[]> {
  try {
    return (await readdir(path.join(CACHE, kind))).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

/**
 * Kunlar × coinlar matritsasi. `close[d][i]` — d-kun yopilishi (NaN — coin hali/endi yo'q),
 * `dollarVol[d][i]` — o'sha kun USDT hajmi, `funding[d][i]` — o'sha kun yig'ilgan funding (ulush).
 */
export interface Panel {
  symbols: string[];
  days: number[];
  close: Float64Array[];
  high: Float64Array[];
  low: Float64Array[];
  dollarVol: Float64Array[];
  funding: Float64Array[] | null;
}

export async function loadPanel(withFunding: boolean): Promise<Panel> {
  const symbols = (await cachedSymbols("1d")).sort();
  const end = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const days: number[] = [];
  for (let t = RESEARCH_START; t < end; t += DAY_MS) days.push(t);
  const n = symbols.length;
  const mk = () => days.map(() => new Float64Array(n).fill(NaN));
  const close = mk();
  const high = mk();
  const low = mk();
  const dollarVol = mk();
  const funding = withFunding ? days.map(() => new Float64Array(n).fill(0)) : null;

  for (let i = 0; i < n; i++) {
    const candles = JSON.parse(await readFile(path.join(CACHE, "1d", `${symbols[i]}.json`), "utf8")) as Candle[];
    for (const c of candles) {
      const d = Math.round((c.openTime - RESEARCH_START) / DAY_MS);
      if (d < 0 || d >= days.length) continue;
      close[d]![i] = c.close;
      high[d]![i] = c.high;
      low[d]![i] = c.low;
      dollarVol[d]![i] = c.volume;
    }
    if (funding) {
      try {
        const rates = JSON.parse(
          await readFile(path.join(CACHE, "funding", `${symbols[i]}.json`), "utf8"),
        ) as { t: number; r: number }[];
        for (const f of rates) {
          const d = Math.floor((f.t - 1 - RESEARCH_START) / DAY_MS); // 00:00 dagi funding oldingi kunga
          if (d >= 0 && d < days.length) funding[d]![i]! += f.r;
        }
      } catch {
        /* funding yo'q — 0 */
      }
    }
  }
  return { symbols, days, close, high, low, dollarVol, funding };
}
