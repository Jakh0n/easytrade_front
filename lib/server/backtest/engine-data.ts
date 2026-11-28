/**
 * Historical data for the engine backtest, cached under .cache/backtest/.
 *   - klines 4h / 1h / 15m / 5m (with taker buy volume → CVD) via the shared `loadCandles` cache
 *   - funding settlements via /fapi/v1/fundingRate
 *   - open interest (5m) from data.binance.vision daily "metrics" archives — the REST endpoint
 *     only keeps 30 days, the archive goes back years
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { getFundingRateRange } from "../services/binance.service";
import type { OiPoint } from "../signal-engine/types";
import { CACHE_DIR, loadCandles } from "./live-strategies";
import type { Candle } from "../types/index";

const DAY_MS = 86_400_000;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

/** Extracts the first file of a zip archive (central-directory based, handles data descriptors). */
export function unzipFirst(buf: Buffer): Buffer {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: end of central directory not found");
  const cd = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip: bad central directory");
  const method = buf.readUInt16LE(cd + 10);
  const compSize = buf.readUInt32LE(cd + 20);
  const localOffset = buf.readUInt32LE(cd + 42);
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  throw new Error(`zip: unsupported method ${method}`);
}

function parseMetricsCsv(text: string): OiPoint[] {
  const out: OiPoint[] = [];
  for (const line of text.split("\n").slice(1)) {
    const cols = line.split(",");
    if (cols.length < 3) continue;
    const time = Date.parse(`${cols[0]!.replace(" ", "T")}Z`);
    const oi = Number(cols[2]);
    if (Number.isFinite(time) && Number.isFinite(oi)) out.push({ time, oi });
  }
  return out;
}

async function fetchMetricsDay(symbol: string, day: number): Promise<OiPoint[] | null> {
  const date = new Date(day).toISOString().slice(0, 10);
  const url = `https://data.binance.vision/data/futures/um/daily/metrics/${symbol}/${symbol}-metrics-${date}.zip`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null; // listed later / archive not published yet
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return parseMetricsCsv(unzipFirst(Buffer.from(await res.arrayBuffer())).toString("utf8"));
}

/** 5m OI points between start and end, cached per symbol (missing days are retried next run). */
export async function loadOpenInterest(symbol: string, start: number, end: number): Promise<OiPoint[]> {
  const file = path.join(CACHE_DIR, "oi", `${symbol}.json`);
  const cache = (await readJson<{ days: Record<string, OiPoint[]> }>(file)) ?? { days: {} };
  const firstDay = Math.floor(start / DAY_MS) * DAY_MS;
  // The archive publishes with ~1 day delay.
  const lastDay = Math.floor((end - DAY_MS) / DAY_MS) * DAY_MS;
  const missing: number[] = [];
  for (let d = firstDay; d <= lastDay; d += DAY_MS) if (!cache.days[d]) missing.push(d);

  let changed = false;
  for (let i = 0; i < missing.length; i += 8) {
    const batch = missing.slice(i, i + 8);
    const results = await Promise.all(batch.map((d) => fetchMetricsDay(symbol, d).catch(() => null)));
    batch.forEach((d, k) => {
      const points = results[k];
      if (points) {
        cache.days[d] = points;
        changed = true;
      }
    });
  }
  if (changed) await writeJson(file, cache);

  return Object.values(cache.days)
    .flat()
    .filter((p) => p.time >= start && p.time <= end)
    .sort((a, b) => a.time - b.time);
}

export async function loadFundingHistory(symbol: string, start: number, end: number): Promise<{ time: number; rate: number }[]> {
  const file = path.join(CACHE_DIR, "funding", `${symbol}.json`);
  const cached = (await readJson<{ time: number; rate: number }[]>(file)) ?? [];
  const out = [...cached];
  let cursor = out.length && out[0]!.time <= start + 8 * 3_600_000 ? out.at(-1)!.time + 1 : start;
  if (cursor === start) out.length = 0;
  while (cursor < end) {
    const page = await getFundingRateRange(symbol, cursor, end);
    if (!page.length) break;
    out.push(...page.map((p) => ({ time: p.fundingTime, rate: p.rate })));
    cursor = page.at(-1)!.fundingTime + 1;
    if (page.length < 1000) break;
  }
  if (out.length !== cached.length) await writeJson(file, out);
  return out.filter((p) => p.time <= end);
}

export interface SymbolHistory {
  symbol: string;
  c4h: Candle[];
  c1h: Candle[];
  c15m: Candle[];
  c5m: Candle[];
  oi: OiPoint[];
  funding: { time: number; rate: number }[];
}

export async function loadSymbolHistory(symbol: string, start: number, end: number, warmupMs: number): Promise<SymbolHistory> {
  const from = start - warmupMs;
  const [c4h, c1h, c15m] = [
    await loadCandles(symbol, "4h", from, end),
    await loadCandles(symbol, "1h", from, end),
    await loadCandles(symbol, "15m", from, end),
  ];
  const c5m = await loadCandles(symbol, "5m", start - DAY_MS, end);
  const oi = await loadOpenInterest(symbol, start - 2 * DAY_MS, end);
  const funding = await loadFundingHistory(symbol, start - 7 * DAY_MS, end);
  return { symbol, c4h, c1h, c15m, c5m, oi, funding };
}
