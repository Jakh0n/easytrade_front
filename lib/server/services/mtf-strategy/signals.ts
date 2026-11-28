import { env } from "../../config/env";
import { FqSignal, type FqSignalDoc } from "../../models/FqSignal";
import { getCurrentFundingRate, getKlines, getKlinesRange } from "../binance.service";
import { CHART_COLORS, renderSignalChart } from "../chart-image.service";
import { runPool } from "../fq-scanner.service";
import { SMC_SYMBOLS } from "../smc.service";
import { resolvePending } from "../smc/engine";
import { isTelegramConfigured, sendTelegramMessage, sendTelegramPhoto } from "../telegram.service";
import type { Candle, MarketType } from "../../types/index";
import { MTF_CONFIG, evaluateMtf, type MtfResult } from "./engine";

/**
 * SMC MTF (4H → 1H → 5m) — har siklda coinlarni tekshiradi. LONG/SHORT chiqsa 5m retest uchun
 * LIMIT order (`pending`) yoziladi va Telegramga yuboriladi. Limit 1 soat (12 ta 5m sham) ichida
 * to'lmasa yoki narx avval TP1 ga yetsa — bekor. To'lgach TP/SL umumiy siklda (5m shamlar).
 *
 * Intizom: shu strategiyaning o'z tarixi (bugungi bekor qilinmagan signallar, ketma-ket zararlar).
 * Yangiliklar manbasi yo'q — `false` deb olinadi, xabarda eslatiladi.
 */
export const MTF_STRATEGY = "smc_mtf" as const;
export const MTF_INTERVAL = "5m";
export const MTF_INTERVAL_MS = 5 * 60_000;
export const MTF_LABEL = "SMC MTF";
/** Limit shu 5m shamlar ichida to'lishi kerak. */
const MTF_MAX_WAIT = 12;

const pair = (s: string) => (s.endsWith("USDT") ? `${s.slice(0, -4)}/USDT` : s);
const closed = (candles: Candle[]) => candles.filter((c) => c.closeTime <= Date.now());

function fmt(price: number): string {
  const digits = price >= 1000 ? 1 : price >= 1 ? 4 : price >= 0.01 ? 5 : 8;
  return Number(price.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function pctFrom(entry: number, price: number): string {
  const v = ((price - entry) / entry) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function telegramActive(): boolean {
  return env.TELEGRAM_SIGNALS_ENABLED && isTelegramConfigured();
}

export interface MtfMarketData {
  c4h: Candle[];
  c1h: Candle[];
  c5m: Candle[];
  fundingRate: number | null;
}

export async function fetchMtfData(symbol: string, market: MarketType = "futures"): Promise<MtfMarketData> {
  const [c4h, c1h, c5m, fundingRate] = await Promise.all([
    getKlines(symbol, "4h", 300, market),
    getKlines(symbol, "1h", 300, market),
    getKlines(symbol, "5m", 300, market),
    market === "futures" ? getCurrentFundingRate(symbol).catch(() => null) : Promise.resolve(null),
  ]);
  return { c4h: closed(c4h), c1h: closed(c1h), c5m: closed(c5m), fundingRate };
}

export async function mtfDisciplineStats(): Promise<{ tradesToday: number; consecutiveLosses: number }> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [tradesToday, recent] = await Promise.all([
    FqSignal.countDocuments({ strategy: MTF_STRATEGY, sentAt: { $gte: start }, status: { $ne: "cancelled" } }),
    // Faqat bugungi yopilganlar: aks holda 2 zarardan keyin yangi savdo bo'lmaydi va limit hech qachon tushmaydi.
    FqSignal.find({ strategy: MTF_STRATEGY, resultR: { $ne: null }, closedAt: { $gte: start } })
      .sort({ closedAt: -1 })
      .limit(10)
      .select({ resultR: 1 })
      .lean(),
  ]);
  let consecutiveLosses = 0;
  for (const doc of recent) {
    if ((doc.resultR ?? 0) < 0) consecutiveLosses += 1;
    else break;
  }
  return { tradesToday, consecutiveLosses };
}

const ENTRY_LABEL: Record<NonNullable<MtfResult["entry_type"]>, string> = {
  FVG: "limit · 5m FVG retest",
  OB: "limit · 5m OB retest",
  CHOCH_50: "limit · CHoCH shamining 50%",
  MARKET: "market · narx kirish zonasida",
};

export function buildMtfMessage(r: MtfResult): string {
  const long = r.decision === "LONG";
  const entry = r.entry!;
  const risk = Math.abs(entry - r.stop_loss!);
  const conf = { high: "yuqori", medium: "o'rta", low: "past" }[r.confidence ?? "low"];
  const c = r.checks;
  const mark = (ok: boolean) => (ok ? "✅" : "❌");
  const zone = r.zone_1h;
  const url = env.APP_URL ? `${env.APP_URL.replace(/\/$/, "")}/coin/${r.symbol}` : null;

  const lines = [
    `${long ? "🟢" : "🔴"} <b>${r.decision} · ${pair(r.symbol)}</b> — ${MTF_LABEL}`,
    `📌 <b>4H trend → 1H ${zone.confluence ? "OB+FVG" : zone.type} + sweep → 5m CHoCH</b> · ishonch: ${conf}`,
    "",
    `Kirish: <code>${fmt(entry)}</code>  (${ENTRY_LABEL[r.entry_type!]})`,
    `Stop:   <code>${fmt(r.stop_loss!)}</code>  (${pctFrom(entry, r.stop_loss!)}) · sweep ${fmt(r.sweep!.extreme)} ortida`,
    `TP1:    <code>${fmt(r.tp1!)}</code>  (${pctFrom(entry, r.tp1!)}) · 1R, 50% yopish, stop → BE`,
    `TP2:    <code>${fmt(r.tp2!)}</code>  (${pctFrom(entry, r.tp2!)}) · ${(Math.abs(r.tp2! - entry) / risk).toFixed(1)}R`,
    `Hajm:   depozit × ${r.position_size} (${MTF_CONFIG.riskPct}% risk)`,
    "",
    `1H zona: ${fmt(zone.low!)} – ${fmt(zone.high!)}`,
    `${mark(c.trend_4h)} 4H  ${mark(c.zone_1h)} Zona  ${mark(c.sweep_1h)} Sweep  ${mark(c.trigger_5m)} 5m  ${mark(c.risk_reward_ok)} R:R ${r.rr}  ${mark(c.filters_ok)} Filtr`,
    `<i>${escapeHtml(r.reason)}</i>`,
    `🚫 Bekor: ${escapeHtml(r.invalidation)}`,
  ];
  for (const w of r.warnings) lines.push(`⚠️ ${escapeHtml(w)}`);
  lines.push("⚠️ Yangiliklar avtomatik tekshirilmaydi — kirishdan oldin kalendarni ko'ring");
  if (url) lines.push("", `<a href="${url}">Grafik →</a>`);
  return lines.join("\n");
}

async function sendMtfSignal(r: MtfResult, c5m: Candle[]): Promise<number> {
  const text = buildMtfMessage(r);
  try {
    const chart = renderSignalChart({
      title: `${r.decision} · ${pair(r.symbol)} — ${MTF_LABEL}`,
      subtitle: `4H → 1H zona + sweep → 5m CHoCH · R:R ${r.rr}`,
      side: r.decision === "LONG" ? "long" : "short",
      candles: c5m.slice(-120),
      levels: [
        { price: r.tp2!, label: "TP2", color: CHART_COLORS.tp },
        { price: r.tp1!, label: "TP1", color: CHART_COLORS.tp },
        { price: r.stop_loss!, label: "STOP", color: CHART_COLORS.stop },
        { price: r.entry!, label: "ENTRY", color: CHART_COLORS.entry },
      ],
      signalTime: c5m[c5m.length - 1]!.openTime,
      marker: r.decision,
      position: { entry: r.entry!, stopLoss: r.stop_loss!, target: r.tp2!, targetLabel: "TP2" },
      formatPrice: fmt,
    });
    return await sendTelegramPhoto(chart, text);
  } catch (error) {
    console.error(`${MTF_LABEL} grafigi ${r.symbol}:`, error instanceof Error ? error.message : error);
    return sendTelegramMessage(text);
  }
}

export async function runMtfSignals(errors: string[]): Promise<{ scanned: number; newSignals: number; sent: number }> {
  const market = env.TELEGRAM_SIGNAL_MARKET as MarketType;
  const discipline = await mtfDisciplineStats();
  // Kunlik limit — skanerlashning o'zi kerak emas.
  if (discipline.tradesToday >= MTF_CONFIG.maxTradesPerDay || discipline.consecutiveLosses >= MTF_CONFIG.maxConsecutiveLosses) {
    return { scanned: 0, newSignals: 0, sent: 0 };
  }
  const active = await FqSignal.find({ strategy: MTF_STRATEGY, status: { $in: ["pending", "open", "tp1"] } })
    .select({ symbol: 1 })
    .lean();
  const busy = new Set(active.map((d) => d.symbol));

  const found = await runPool([...SMC_SYMBOLS], 6, async (symbol) => {
    if (busy.has(symbol)) return null;
    try {
      const data = await fetchMtfData(symbol, market);
      const result = evaluateMtf({
        symbol,
        ...data,
        newsWithin30min: false,
        tradesToday: discipline.tradesToday,
        consecutiveLosses: discipline.consecutiveLosses,
      });
      return result.decision === "LONG" || result.decision === "SHORT" ? { result, c5m: data.c5m } : null;
    } catch (error) {
      errors.push(`${MTF_LABEL} ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });

  // Yuqori ishonchlilar birinchi (kunlik limit 3 ta).
  const rank = { high: 0, medium: 1, low: 2 } as const;
  found.sort((a, b) => rank[a.result.confidence ?? "low"] - rank[b.result.confidence ?? "low"] || (b.result.rr ?? 0) - (a.result.rr ?? 0));

  let newSignals = 0;
  let sent = 0;
  let tradesToday = discipline.tradesToday;
  for (const { result: r, c5m } of found) {
    if (tradesToday >= MTF_CONFIG.maxTradesPerDay) break;
    const side = r.decision === "LONG" ? "long" : "short";
    // Bitta sweep — bitta signal.
    const sweepTime = new Date(r.sweep!.time);
    if (await FqSignal.exists({ strategy: MTF_STRATEGY, symbol: r.symbol, side, signalTime: { $gte: sweepTime } })) continue;

    const last = c5m[c5m.length - 1]!;
    let doc: FqSignalDoc;
    try {
      doc = await FqSignal.create({
        strategy: MTF_STRATEGY,
        symbol: r.symbol,
        marketType: market,
        side,
        setup: null,
        signalTime: new Date(last.openTime),
        entry: r.entry!,
        stopLoss: r.stop_loss!,
        tp1: r.tp1!,
        tp2: r.tp2!,
        // Narx TP1 ga kirishsiz yetsa — order bekor.
        invalidate: r.tp1!,
        score: r.confidence === "high" ? 3 : r.confidence === "medium" ? 2 : 1,
        status: "pending",
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) continue;
      errors.push(`${MTF_LABEL} ${r.symbol}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    newSignals += 1;
    tradesToday += 1;

    if (!telegramActive()) continue;
    try {
      const messageId = await sendMtfSignal(r, c5m);
      await FqSignal.updateOne({ _id: doc._id }, { telegramMessageId: messageId });
      sent += 1;
    } catch (error) {
      errors.push(`Telegram ${MTF_LABEL} ${r.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { scanned: SMC_SYMBOLS.length, newSignals, sent };
}

/** Kutilayotgan limitlar: to'ldimi yoki bekor bo'ldimi. To'lganlari `open` (TP/SL umumiy siklda). */
export async function updatePendingMtf(errors: string[]): Promise<number> {
  const pending = await FqSignal.find({ strategy: MTF_STRATEGY, status: "pending" }).limit(50);
  let updated = 0;
  for (const doc of pending) {
    try {
      const start = doc.signalTime.getTime() + MTF_INTERVAL_MS;
      const after = closed(await getKlinesRange(doc.symbol, MTF_INTERVAL, start, Date.now(), doc.marketType as MarketType));
      const res = resolvePending(
        { side: doc.side as "long" | "short", entry: doc.entry, stopLoss: doc.stopLoss, invalidate: doc.invalidate ?? NaN },
        after,
        MTF_MAX_WAIT,
      );
      if (res.state === "pending") continue;
      const head = `<i>${doc.side === "long" ? "LONG" : "SHORT"} · ${pair(doc.symbol)} · ${MTF_LABEL}</i>`;
      const notify = async (text: string) => {
        if (doc.telegramMessageId && telegramActive()) {
          await sendTelegramMessage(`${text}\n${head}`, { replyTo: doc.telegramMessageId });
        }
      };

      if (res.state === "cancelled") {
        await FqSignal.updateOne({ _id: doc._id }, { status: "cancelled", closedAt: new Date(res.at) });
        updated += 1;
        await notify(
          res.reason === "invalidated"
            ? "❌ <b>Order bekor</b> — narx kirishga qaytmasdan TP1 ga yetdi"
            : "❌ <b>Order bekor</b> — 1 soat ichida limit to'lmadi",
        );
        continue;
      }

      const fill = after[res.index]!;
      if (res.stoppedOnFill) {
        await FqSignal.updateOne(
          { _id: doc._id },
          { status: "sl", resultR: -1, filledAt: new Date(fill.openTime), closedAt: new Date(fill.closeTime) },
        );
        updated += 1;
        await notify("✅ Limit to'ldi, lekin shu shamning o'zida 🛑 <b>stop urildi</b> — <b>-1.00R</b>");
        continue;
      }
      await FqSignal.updateOne({ _id: doc._id }, { status: "open", filledAt: new Date(fill.openTime) });
      updated += 1;
      await notify(`✅ <b>Limit to'ldi</b> — savdo ochiq (kirish ${fmt(doc.entry)})`);
    } catch (error) {
      errors.push(`${MTF_LABEL} pending ${doc.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return updated;
}
