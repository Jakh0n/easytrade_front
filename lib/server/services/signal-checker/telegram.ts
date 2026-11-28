import { env } from "../../config/env";
import { FqSignal, type FqSignalDoc } from "../../models/FqSignal";
import { CHART_COLORS, renderSignalChart } from "../chart-image.service";
import { runPool } from "../fq-scanner.service";
import { getKlines } from "../binance.service";
import { SMC_SYMBOLS } from "../smc.service";
import { isTelegramConfigured, sendTelegramMessage, sendTelegramPhoto } from "../telegram.service";
import type { Candle } from "../../types/index";
import { checkWithAi } from "./ai";
import { runSignalCheck, type SignalCheckResponse } from "./index";

/**
 * SMC 5M (signal tekshiruvchi) — har siklda coinlarni 6 ta qoida bo'yicha tekshiradi,
 * LONG/SHORT chiqqanini bazaga yozib Telegramga yuboradi. TP/SL kuzatuvi umumiy siklda
 * (`updateOpenSignals`, 5m shamlar) — TP1 da 50% va stop BE ga.
 *
 * Intizom (6-qoida) shu strategiyaning o'z tarixidan: bugun yuborilgan signallar soni va
 * oxirgi yopilganlar ichida ketma-ket zararlar. Yangiliklar manbasi yo'q — `false` deb olinadi.
 */
export const CHECKER_STRATEGY = "smc_5m" as const;
export const CHECKER_INTERVAL = "5m";
export const CHECKER_INTERVAL_MS = 5 * 60_000;

const pair = (s: string) => (s.endsWith("USDT") ? `${s.slice(0, -4)}/USDT` : s);

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

async function disciplineStats(): Promise<{ tradesToday: number; consecutiveLosses: number }> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [tradesToday, recent] = await Promise.all([
    FqSignal.countDocuments({ strategy: CHECKER_STRATEGY, sentAt: { $gte: start } }),
    FqSignal.find({ strategy: CHECKER_STRATEGY, resultR: { $ne: null }, closedAt: { $ne: null } })
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

export function buildCheckerMessage(check: SignalCheckResponse): string {
  const { result: r, snapshot: s, ai } = check;
  const long = r.decision === "LONG";
  const side = long ? s.long : s.short;
  const entry = r.entry!;
  const rOf = (p: number) => (Math.abs(p - entry) / Math.abs(entry - r.stop_loss!)).toFixed(1);
  const c = r.checks;
  const mark = (ok: boolean) => (ok ? "✅" : "❌");
  const conf = { high: "yuqori", medium: "o'rta", low: "past" }[r.confidence];
  const url = env.APP_URL ? `${env.APP_URL.replace(/\/$/, "")}/coin/${s.symbol}` : null;

  const lines = [
    `${long ? "🟢" : "🔴"} <b>${r.decision} · ${pair(s.symbol)}</b> — SMC 5M`,
    `📌 <b>Sweep → zona → 5m ${side.choch_5m ? "CHoCH" : "BOS"}</b> · ishonch: ${conf}`,
    `<i>${escapeHtml(r.reason)}</i>`,
    "",
    `Kirish: <code>${fmt(entry)}</code>  (market)`,
    `Stop:   <code>${fmt(r.stop_loss!)}</code>  (${pctFrom(entry, r.stop_loss!)}) · sweep ${fmt(side.sweep!.extreme)} ortida`,
    `TP1:    <code>${fmt(r.tp1!)}</code>  (${pctFrom(entry, r.tp1!)}) · 1R, 50% yopish, stop → BE`,
    `TP2:    <code>${fmt(r.tp2!)}</code>  (${pctFrom(entry, r.tp2!)}) · ${rOf(r.tp2!)}R${side.next_liquidity !== null ? " · keyingi likvidlik" : ""}`,
    "",
    `${mark(c.trend)} Trend  ${mark(c.zone)} Zona  ${mark(c.trigger)} Trigger  ${mark(c.filter)} Filtr  ${mark(c.risk_reward)} R:R  ${mark(c.discipline)} Intizom`,
    `🚫 Bekor: ${escapeHtml(r.invalidation)}`,
  ];
  if (s.funding_rate_pct !== null) lines.push(`💸 Funding: ${s.funding_rate_pct}%`);
  for (const w of r.warnings) lines.push(`⚠️ ${escapeHtml(w)}`);
  lines.push("⚠️ Yangiliklar avtomatik tekshirilmaydi — kirishdan oldin kalendarni ko'ring");
  if (ai) {
    lines.push(
      ai.decision === r.decision
        ? `🤖 AI tasdiqladi: ${escapeHtml(ai.reason)}`
        : `🤖 AI rozi emas (${ai.decision}): ${escapeHtml(ai.reason)}`,
    );
  }
  if (url) lines.push("", `<a href="${url}">Grafik →</a>`);
  return lines.join("\n");
}

async function sendCheckerSignal(check: SignalCheckResponse, candles: Candle[]): Promise<number> {
  const text = buildCheckerMessage(check);
  const r = check.result;
  try {
    const chart = renderSignalChart({
      title: `${r.decision} · ${pair(r.symbol)} — SMC 5M`,
      subtitle: `Sweep → zona → 5m trigger · R:R ${r.rr}`,
      side: r.decision === "LONG" ? "long" : "short",
      candles: candles.slice(-120),
      levels: [
        { price: r.tp2!, label: "TP2", color: CHART_COLORS.tp },
        { price: r.tp1!, label: "TP1", color: CHART_COLORS.tp },
        { price: r.stop_loss!, label: "STOP", color: CHART_COLORS.stop },
        { price: r.entry!, label: "ENTRY", color: CHART_COLORS.entry },
      ],
      signalTime: candles[candles.length - 1]!.openTime,
      marker: r.decision,
      position: { entry: r.entry!, stopLoss: r.stop_loss!, target: r.tp2!, targetLabel: "TP2" },
      formatPrice: fmt,
    });
    return await sendTelegramPhoto(chart, text);
  } catch (error) {
    console.error(`SMC 5M grafigi ${r.symbol}:`, error instanceof Error ? error.message : error);
    return sendTelegramMessage(text);
  }
}

export async function runCheckerSignals(errors: string[]): Promise<{ scanned: number; newSignals: number; sent: number }> {
  const market = "futures" as const;
  const discipline = await disciplineStats();
  const active = await FqSignal.find({ strategy: CHECKER_STRATEGY, status: { $in: ["open", "tp1"] } }).select({ symbol: 1 }).lean();
  const inTrade = new Set(active.map((d) => d.symbol));

  // Qoidalar avval (AI'siz) — AI faqat o'tganlarga chaqiriladi.
  const found = await runPool([...SMC_SYMBOLS], 6, async (symbol) => {
    if (inTrade.has(symbol)) return null;
    try {
      const check = await runSignalCheck(symbol, {
        newsWithin30min: false,
        tradesToday: discipline.tradesToday,
        consecutiveLosses: discipline.consecutiveLosses,
        useAi: false,
      });
      return check.result.decision === "NO_TRADE" ? null : { symbol, check };
    } catch (error) {
      errors.push(`SMC 5M ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });

  let newSignals = 0;
  let sent = 0;
  let tradesToday = discipline.tradesToday;
  for (const { symbol, check } of found) {
    if (tradesToday >= 3) break; // 6-qoida shu sikl ichida ham
    const r = check.result;
    const side = r.decision === "LONG" ? "long" : "short";
    const sweepTime = new Date(check.snapshot[side].sweep!.time);
    // Bitta sweep — bitta signal (savdo yopilgach shu setup qayta yuborilmaydi).
    if (await FqSignal.exists({ strategy: CHECKER_STRATEGY, symbol, side, signalTime: { $gte: sweepTime } })) continue;

    const candles = (await getKlines(symbol, CHECKER_INTERVAL, 300, market)).filter((c) => c.closeTime <= Date.now());
    const last = candles[candles.length - 1];
    if (!last) continue;

    let docId: FqSignalDoc["_id"];
    try {
      const doc = await FqSignal.create({
        strategy: CHECKER_STRATEGY,
        symbol,
        marketType: market,
        side,
        setup: null,
        signalTime: new Date(last.openTime),
        entry: r.entry!,
        stopLoss: r.stop_loss!,
        tp1: r.tp1!,
        tp2: r.tp2!,
        score: r.confidence === "high" ? 3 : 2,
        status: "open",
      });
      docId = doc._id;
    } catch (error) {
      if ((error as { code?: number }).code === 11000) continue;
      errors.push(`SMC 5M ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    newSignals += 1;
    tradesToday += 1;

    if (!telegramActive()) continue;
    try {
      const ai = await checkWithAi(check.snapshot);
      if (ai && ai.decision !== r.decision) r.warnings.push(`AI boshqa qaror berdi (${ai.decision}) — qoidalar natijasi ustun.`);
      const messageId = await sendCheckerSignal({ ...check, ai, agree: ai ? ai.decision === r.decision : null }, candles);
      await FqSignal.updateOne({ _id: docId }, { telegramMessageId: messageId });
      sent += 1;
    } catch (error) {
      errors.push(`Telegram SMC 5M ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { scanned: SMC_SYMBOLS.length, newSignals, sent };
}
