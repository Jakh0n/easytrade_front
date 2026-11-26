import { env } from "../config/env";
import { FqSignal, type FqSignalDoc } from "../models/FqSignal";
import { getKlines, getKlinesRange } from "./binance.service";
import { CHART_COLORS, renderSignalChart } from "./chart-image.service";
import { calculateEMA } from "./indicators.service";
import { runFqScan } from "./fq-scanner.service";
import { runDayScan } from "./day.strategy.service";
import { DAY_BAR_MS, DAY_CONFIG, computeSupertrend, evaluateDayOutcome } from "./day-strategy/engine";
import { FQ_PROFILES, type FqProfile, type FqStrategyId } from "./fq.strategy.service";
import { evaluateSignalOutcome, SIGNAL_MAX_BARS } from "./fq-strategy/outcome";
import { runMomentumRebalance } from "./momentum.service";
import { SMC_INTERVAL, SMC_INTERVAL_MS, runSmcSignals, updatePendingSmc } from "./smc.service";
import { isTelegramConfigured, sendTelegramMessage, sendTelegramPhoto } from "./telegram.service";
import type {
  Candle,
  DayAnalysis,
  FqScanCoin,
  SignalRecord,
  SignalRunResult,
  SignalStatus,
  SignalsResponse,
  StrategyId,
} from "../types/index";

/** Day signal natijasini hisoblashda Supertrend uchun isitish shamlari. */
const DAY_WARMUP_BARS = 250;

/** Eski hujjatlarda `strategy` maydoni yo'q — ular FQ v3 hisoblanadi. */
function strategyFilter(strategy: StrategyId): { strategy: { $in: (StrategyId | null)[] } } {
  return { strategy: { $in: strategy === "fq_v3" ? ["fq_v3", null] : [strategy] } };
}

let indexesSynced = false;
/** Unikal indeks (strategy, symbol, side, signalTime) ga o'tdi — eski indeksni bir marta almashtiramiz. */
async function syncIndexesOnce(): Promise<void> {
  if (indexesSynced) return;
  indexesSynced = true;
  try {
    await FqSignal.syncIndexes();
  } catch (error) {
    console.error("FqSignal indekslari yangilanmadi:", error instanceof Error ? error.message : error);
  }
}

// ───────────── Formatlash ─────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatSignalPrice(price: number): string {
  const digits = price >= 1000 ? 1 : price >= 1 ? 4 : price >= 0.01 ? 5 : 8;
  return Number(price.toFixed(digits)).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function pctFrom(entry: number, price: number): string {
  const value = ((price - entry) / entry) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function pairLabel(symbol: string): string {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function coinUrl(symbol: string): string | null {
  return env.APP_URL ? `${env.APP_URL.replace(/\/$/, "")}/coin/${symbol}` : null;
}

export function buildSignalMessage(coin: FqScanCoin): string {
  const long = coin.side === "long";
  const stopPct = Math.abs((coin.stopLoss - coin.entry) / coin.entry) * 100;
  const notionalPct = (coin.riskPercent / stopPct) * 100;
  const setup = coin.setup === "breakout" ? "Breakout" : "Pullback";
  const htf = coin.htfBias === "bullish" ? "bullish" : coin.htfBias === "bearish" ? "bearish" : "—";
  const url = coinUrl(coin.symbol);
  const profile = FQ_PROFILES[coin.strategyId];

  const lines = [
    `${long ? "🟢" : "🔴"} <b>${long ? "LONG" : "SHORT"} · ${escapeHtml(pairLabel(coin.symbol))}</b> — ${setup}`,
    `📌 <b>${escapeHtml(profile.label)}</b>`,
    `<i>${coin.timeframe.toUpperCase()} kirish · ${coin.htfTimeframe.toUpperCase()} trend ${htf}${coin.confluences.length ? ` · ${escapeHtml(coin.confluences.join(" · "))}` : ""}</i>`,
    "",
    `Kirish:  <code>${formatSignalPrice(coin.entry)}</code>`,
    `Stop:    <code>${formatSignalPrice(coin.stopLoss)}</code>  (${pctFrom(coin.entry, coin.stopLoss)})`,
    `TP1:     <code>${formatSignalPrice(coin.tp1)}</code>  (${pctFrom(coin.entry, coin.tp1)}) · 50% yopish, stop → BE`,
    `TP2:     <code>${formatSignalPrice(coin.tp2)}</code>  (${pctFrom(coin.entry, coin.tp2)}) · ${coin.riskReward}R`,
    "",
    `Hajm: ${coin.riskPercent}% risk → pozitsiya ≈ kapitalning <b>${notionalPct.toFixed(0)}%</b>${notionalPct > 100 ? ` (≈${Math.ceil(notionalPct / 100)}x leverage)` : ""}`,
    `ADX ${coin.indicators.adx.toFixed(1)} · RSI ${coin.indicators.rsi.toFixed(0)} · 24s ${coin.priceChangePercent >= 0 ? "+" : ""}${coin.priceChangePercent.toFixed(2)}%`,
  ];
  if (url) lines.push("", `<a href="${url}">Grafik va tafsilotlar →</a>`);
  return lines.join("\n");
}

export function buildDaySignalMessage(coin: DayAnalysis): string {
  const long = coin.side === "long";
  const stopPct = Math.abs((coin.stopLoss - coin.entry) / coin.entry) * 100;
  const notionalPct = (coin.riskPercent / stopPct) * 100;
  const url = coinUrl(coin.symbol);
  const lines = [
    `${long ? "🟢" : "🔴"} <b>${long ? "LONG" : "SHORT"} · ${escapeHtml(pairLabel(coin.symbol))}</b> — Day trade`,
    `📌 <b>Day 15M · Supertrend</b>`,
    `<i>Supertrend(${DAY_CONFIG.stLen}, ${DAY_CONFIG.stMult}) · ${coin.timeframe.toUpperCase()} · ${coin.htfTimeframe.toUpperCase()} trend ${coin.htfBias ?? "—"}</i>`,
    "",
    `Kirish:  <code>${formatSignalPrice(coin.entry)}</code>`,
    `Stop:    <code>${formatSignalPrice(coin.stopLoss)}</code>  (${pctFrom(coin.entry, coin.stopLoss)})`,
    `Chiqish: Supertrend teskari o'girilganda (TP yo'q, trend bilan yurish)`,
    "",
    `Hajm: ${coin.riskPercent}% risk → pozitsiya ≈ kapitalning <b>${notionalPct.toFixed(0)}%</b>${notionalPct > 100 ? ` (≈${Math.ceil(notionalPct / 100)}x leverage)` : ""}`,
    `24s ${coin.priceChangePercent >= 0 ? "+" : ""}${coin.priceChangePercent.toFixed(2)}% · win rate past (~30%), foyda katta savdolardan`,
  ];
  if (url) lines.push("", `<a href="${url}">Grafik →</a>`);
  return lines.join("\n");
}

/** Day signal grafigi: oxirgi ~90 ta 15M sham, Supertrend, kirish/stop. */
const DAY_CHART_BARS = 90;
/** Day'da TP yo'q — yashil zona faqat yo'nalish uchun 2R mo'ljal (backtestda foyda katta savdolardan). */
const DAY_CHART_TARGET_R = 2;
export async function buildDaySignalChart(coin: DayAnalysis, candlesOverride?: Candle[]): Promise<Buffer> {
  const candles =
    candlesOverride ??
    (await getKlines(coin.symbol, DAY_CONFIG.interval, 500, coin.marketType)).filter((c) => c.closeTime <= Date.now());
  const { dir, line } = computeSupertrend(candles);
  const from = Math.max(0, candles.length - DAY_CHART_BARS);
  const long = coin.side === "long";
  return renderSignalChart({
    title: `${long ? "LONG" : "SHORT"} · ${pairLabel(coin.symbol)} — savdoga kirildi`,
    subtitle: `Day trade · Supertrend(${DAY_CONFIG.stLen}, ${DAY_CONFIG.stMult}) · ${DAY_CONFIG.interval.toUpperCase()} · ${DAY_CONFIG.htfInterval.toUpperCase()} trend ${coin.htfBias ?? "—"}`,
    side: long ? "long" : "short",
    candles: candles.slice(from),
    lines: [{ values: line.slice(from), dir: dir.slice(from), label: `Supertrend(${DAY_CONFIG.stLen}, ${DAY_CONFIG.stMult})` }],
    levels: [
      { price: coin.stopLoss, label: "STOP", color: CHART_COLORS.stop },
      { price: coin.entry, label: "KIRISH", color: CHART_COLORS.entry },
    ],
    signalTime: coin.signalTime ?? undefined,
    marker: `${long ? "LONG" : "SHORT"} ST`,
    position: {
      entry: coin.entry,
      stopLoss: coin.stopLoss,
      target: coin.entry + (coin.entry - coin.stopLoss) * DAY_CHART_TARGET_R,
      targetLabel: "Mo'ljal (TP emas)",
    },
    formatPrice: formatSignalPrice,
  });
}

/** Swing signal grafigi: oxirgi ~90 ta sham (1H yoki 4H), EMA 20/50, kirish/stop/TP1/TP2. */
const SWING_CHART_BARS = 90;
export async function buildSwingSignalChart(coin: FqScanCoin): Promise<Buffer> {
  const raw = await getKlines(coin.symbol, coin.timeframe, 300, coin.marketType);
  const candles = raw.filter((c) => c.closeTime <= Date.now());
  const closes = candles.map((c) => c.close);
  const from = Math.max(0, candles.length - SWING_CHART_BARS);
  const long = coin.side === "long";
  const setup = coin.setup === "breakout" ? "Breakout" : "Pullback";
  return renderSignalChart({
    title: `${long ? "LONG" : "SHORT"} · ${pairLabel(coin.symbol)} — savdoga kirildi`,
    subtitle: `${FQ_PROFILES[coin.strategyId].label} · ${setup} · ${coin.htfTimeframe.toUpperCase()} trend ${coin.htfBias ?? "—"}`,
    side: long ? "long" : "short",
    candles: candles.slice(from),
    lines: [
      { values: calculateEMA(closes, 20).slice(from), color: CHART_COLORS.ema20, label: "EMA 20" },
      { values: calculateEMA(closes, 50).slice(from), color: CHART_COLORS.ema50, label: "EMA 50" },
    ],
    levels: [
      { price: coin.tp2, label: "TP2", color: CHART_COLORS.tp },
      { price: coin.tp1, label: "TP1", color: CHART_COLORS.tp },
      { price: coin.stopLoss, label: "STOP", color: CHART_COLORS.stop },
      { price: coin.entry, label: "KIRISH", color: CHART_COLORS.entry },
    ],
    signalTime: coin.signalTime ?? undefined,
    marker: `${long ? "LONG" : "SHORT"} ${coin.setup === "breakout" ? "BO" : "PB"}`,
    position: { entry: coin.entry, stopLoss: coin.stopLoss, target: coin.tp2, targetLabel: "TP2" },
    formatPrice: formatSignalPrice,
  });
}

/** Rasm + matn; rasm chizish yoki sendPhoto xato bersa — oddiy matn (signal yo'qolmaydi). */
async function sendWithChart(symbol: string, text: string, chart: () => Promise<Buffer>): Promise<number> {
  try {
    return await sendTelegramPhoto(await chart(), text);
  } catch (error) {
    console.error(`Signal grafigi ${symbol}:`, error instanceof Error ? error.message : error);
    return sendTelegramMessage(text);
  }
}

/** Day signalni rasm bilan yuboradi. */
async function sendDaySignal(coin: DayAnalysis): Promise<number> {
  return sendWithChart(coin.symbol, buildDaySignalMessage(coin), () => buildDaySignalChart(coin));
}

const STATUS_MESSAGES: Partial<Record<SignalStatus, (r: number) => string>> = {
  tp1: () => "✅ <b>TP1 urildi</b> — 50% yopildi (+1R), stop BE ga surildi",
  tp2: (r) => `🎯 <b>TP2 urildi</b> — savdo yopildi, jami <b>+${r.toFixed(2)}R</b>`,
  be: (r) => `⚖️ <b>BE da yopildi</b> — jami <b>+${r.toFixed(2)}R</b>`,
  sl: (r) => `🛑 <b>Stop urildi</b> — <b>${r.toFixed(2)}R</b>`,
  exit: (r) => `🔁 <b>Supertrend teskari</b> — savdo yopildi, natija <b>${r >= 0 ? "+" : ""}${r.toFixed(2)}R</b>`,
  expired: (r) => `⌛ <b>Muddat o'tdi</b> — yopilmadi, hozirgi natija ${r >= 0 ? "+" : ""}${r.toFixed(2)}R`,
};

function buildStatusMessage(doc: FqSignalDoc, status: SignalStatus, resultR: number | null): string | null {
  const builder = STATUS_MESSAGES[status];
  if (!builder) return null;
  const label =
    doc.strategy === "st_day"
      ? "Day 15M"
      : doc.strategy === "smc_4h"
        ? "SMC 4H"
        : FQ_PROFILES[(doc.strategy ?? "fq_v3") as FqStrategyId].label;
  const head = `${doc.side === "long" ? "LONG" : "SHORT"} · ${escapeHtml(pairLabel(doc.symbol))} · ${escapeHtml(label)}`;
  return `${builder(resultR ?? 0)}\n<i>${head}</i>`;
}

// ───────────── Signal sikli ─────────────

function telegramActive(): boolean {
  return env.TELEGRAM_SIGNALS_ENABLED && isTelegramConfigured();
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

async function sentTodayCount(strategy: StrategyId): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return FqSignal.countDocuments({
    ...strategyFilter(strategy),
    sentAt: { $gte: start },
    telegramMessageId: { $ne: null },
  });
}

async function updateDaySignal(doc: FqSignalDoc): Promise<{ status: SignalStatus; resultR: number | null; closedAt: number | null }> {
  const signalTime = doc.signalTime.getTime();
  const candles = (
    await getKlinesRange(
      doc.symbol,
      DAY_CONFIG.interval,
      signalTime - DAY_WARMUP_BARS * DAY_BAR_MS,
      Date.now(),
      doc.marketType as "spot" | "futures",
    )
  ).filter((c) => c.closeTime <= Date.now());
  return evaluateDayOutcome(
    { side: doc.side as "long" | "short", entry: doc.entry, stopLoss: doc.stopLoss, signalTime },
    candles,
  );
}

/** Ochiq signallarni TP1/TP2/SL bo'yicha yangilaydi va o'zgarishni Telegramga reply qiladi. */
async function updateOpenSignals(errors: string[]): Promise<number> {
  const open = await FqSignal.find({ status: { $in: ["open", "tp1"] } }).limit(50);
  let updated = 0;

  for (const doc of open) {
    try {
      if (doc.strategy === "st_day") {
        const outcome = await updateDaySignal(doc);
        if (outcome.status === doc.status) continue;
        doc.status = outcome.status;
        doc.resultR = outcome.resultR;
        doc.closedAt = outcome.closedAt ? new Date(outcome.closedAt) : null;
        await doc.save();
        updated += 1;
        if (doc.telegramMessageId && telegramActive()) {
          const text = buildStatusMessage(doc, outcome.status, outcome.resultR);
          if (text) await sendTelegramMessage(text, { replyTo: doc.telegramMessageId });
        }
        continue;
      }

      // SMC: savdo limit to'lgan shamdan keyin boshlanadi; FQ: signal shamidan keyin.
      const { interval, intervalMs } =
        doc.strategy === "smc_4h"
          ? { interval: SMC_INTERVAL, intervalMs: SMC_INTERVAL_MS }
          : FQ_PROFILES[(doc.strategy ?? "fq_v3") as FqStrategyId];
      const start = (doc.filledAt ?? doc.signalTime).getTime() + intervalMs;
      const end = Math.min(Date.now(), start + SIGNAL_MAX_BARS * intervalMs);
      const candles = (
        await getKlinesRange(doc.symbol, interval, start, end, doc.marketType as "spot" | "futures")
      ).filter((c) => c.closeTime <= Date.now());

      const outcome = evaluateSignalOutcome(
        {
          side: doc.side as "long" | "short",
          entry: doc.entry,
          stopLoss: doc.stopLoss,
          tp1: doc.tp1!,
          tp2: doc.tp2!,
        },
        candles,
      );
      if (outcome.status === doc.status) continue;

      const previous = doc.status;
      doc.status = outcome.status;
      doc.resultR = outcome.resultR;
      doc.closedAt = outcome.closedAt ? new Date(outcome.closedAt) : null;
      await doc.save();
      updated += 1;

      if (doc.telegramMessageId && telegramActive()) {
        // TP1 va keyingi holat bitta siklda bo'lsa, ikkalasini ham xabar qilamiz.
        const statuses: SignalStatus[] =
          previous === "open" && outcome.tp1At !== null && outcome.status !== "tp1"
            ? ["tp1", outcome.status]
            : [outcome.status];
        for (const status of statuses) {
          const text = buildStatusMessage(doc, status, outcome.resultR);
          if (text) await sendTelegramMessage(text, { replyTo: doc.telegramMessageId });
        }
      }
    } catch (error) {
      errors.push(`${doc.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return updated;
}

/** Yoqilgan swing profillari (har biri alohida strategiya, alohida limit). */
function enabledFqProfiles(): FqProfile[] {
  const list: FqProfile[] = [];
  if (env.FQ_1H_SIGNALS_ENABLED) list.push(FQ_PROFILES.fq_v3);
  if (env.FQ_4H_SIGNALS_ENABLED) list.push(FQ_PROFILES.fq_4h);
  return list;
}

/** Bitta FQ profili: skaner → yangi signallar → Telegram. */
async function runFqSignals(
  profile: FqProfile,
  errors: string[],
): Promise<{ scanned: number; newSignals: number; sent: number }> {
  const scan = await runFqScan(env.TELEGRAM_SIGNAL_MARKET, { fresh: true, strategy: profile.id });

  const fresh = scan.coins.filter(
    (c) => c.verdict === "enter" && c.signalBarsAgo === 0 && c.signalTime !== null && c.side !== null,
  );

  // Pine: pyramiding = 0 — shu strategiyada shu coinda ochiq signal bo'lsa yangisi olinmaydi.
  const openSymbols = new Set(
    (await FqSignal.find({ ...strategyFilter(profile.id), status: { $in: ["open", "tp1"] } }, { symbol: 1 })).map(
      (d) => d.symbol,
    ),
  );

  let newSignals = 0;
  let sent = 0;
  let dailyLeft = env.TELEGRAM_MAX_SIGNALS_PER_DAY - (await sentTodayCount(profile.id));

  for (const coin of fresh) {
    if (openSymbols.has(coin.symbol)) continue;

    let doc: FqSignalDoc;
    try {
      doc = await FqSignal.create({
        strategy: profile.id,
        symbol: coin.symbol,
        marketType: coin.marketType,
        side: coin.side as "long" | "short",
        setup: coin.setup,
        signalTime: new Date(coin.signalTime!),
        entry: coin.entry,
        stopLoss: coin.stopLoss,
        tp1: coin.tp1,
        tp2: coin.tp2,
        score: coin.score,
      });
    } catch (error) {
      if (isDuplicateKey(error)) continue; // allaqachon yuborilgan
      errors.push(`${profile.id} ${coin.symbol}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    newSignals += 1;
    openSymbols.add(coin.symbol);

    if (!telegramActive() || sent >= env.TELEGRAM_MAX_SIGNALS_PER_RUN || dailyLeft <= 0) continue;
    try {
      const messageId = await sendWithChart(coin.symbol, buildSignalMessage(coin), () => buildSwingSignalChart(coin));
      await FqSignal.updateOne({ _id: doc._id }, { telegramMessageId: messageId });
      sent += 1;
      dailyLeft -= 1;
    } catch (error) {
      errors.push(`Telegram ${profile.id} ${coin.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { scanned: scan.scanned, newSignals, sent };
}

/**
 * Har bir yoqilgan strategiya alohida tekshiriladi — qaysi biriga mos signal chiqsa,
 * o'sha strategiya nomi bilan botga yuboriladi. Bitta strategiyadagi xato boshqalarini to'xtatmaydi.
 */
export async function runSignalCycle(): Promise<SignalRunResult> {
  const errors: string[] = [];
  await syncIndexesOnce();

  const runs: { id: string; run: () => Promise<{ scanned: number; newSignals: number; sent: number }> }[] = [
    ...enabledFqProfiles().map((profile) => ({ id: profile.label, run: () => runFqSignals(profile, errors) })),
    ...(env.SMC_4H_SIGNALS_ENABLED ? [{ id: "SMC 4H", run: () => runSmcSignals(errors) }] : []),
    ...(env.DAY_SIGNALS_ENABLED ? [{ id: "Day trade", run: () => runDaySignals(errors) }] : []),
    ...(env.MOMENTUM_SIGNALS_ENABLED
      ? [
          {
            id: "Momentum",
            run: async () => {
              const r = await runMomentumRebalance();
              return { scanned: 0, newSignals: r.rebalanced ? 1 : 0, sent: r.sent ? 1 : 0 };
            },
          },
        ]
      : []),
  ];

  let scanned = 0;
  let newSignals = 0;
  let sent = 0;
  for (const { id, run } of runs) {
    try {
      const result = await run();
      scanned += result.scanned;
      newSignals += result.newSignals;
      sent += result.sent;
    } catch (error) {
      errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let updated = 0;
  try {
    updated += await updatePendingSmc(errors);
  } catch (error) {
    errors.push(`SMC pending: ${error instanceof Error ? error.message : String(error)}`);
  }
  updated += await updateOpenSignals(errors);

  return {
    scanned,
    newSignals,
    sent,
    updated,
    errors,
    ranAt: new Date().toISOString(),
  };
}

/** Day trade: yopilgan oxirgi 15M shamda Supertrend 1H trend tomonga o'girilgan coinlar. */
async function runDaySignals(errors: string[]): Promise<{ scanned: number; newSignals: number; sent: number }> {
  const scan = await runDayScan(env.TELEGRAM_SIGNAL_MARKET, { fresh: true });
  const fresh = scan.coins.filter(
    (c) => c.verdict === "enter" && c.flipBarsAgo === 0 && c.signalTime !== null && c.side !== null,
  );
  const openSymbols = new Set(
    (await FqSignal.find({ strategy: "st_day", status: "open" }, { symbol: 1 })).map((d) => d.symbol),
  );

  let newSignals = 0;
  let sent = 0;
  let dailyLeft = env.TELEGRAM_MAX_SIGNALS_PER_DAY - (await sentTodayCount("st_day"));

  for (const coin of fresh) {
    if (openSymbols.has(coin.symbol)) continue;
    let doc: FqSignalDoc;
    try {
      doc = await FqSignal.create({
        strategy: "st_day",
        symbol: coin.symbol,
        marketType: coin.marketType,
        side: coin.side as "long" | "short",
        setup: null,
        signalTime: new Date(coin.signalTime!),
        entry: coin.entry,
        stopLoss: coin.stopLoss,
        tp1: null,
        tp2: null,
        score: 0,
      });
    } catch (error) {
      if (isDuplicateKey(error)) continue;
      errors.push(`Day ${coin.symbol}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    newSignals += 1;
    openSymbols.add(coin.symbol);

    if (!telegramActive() || sent >= env.TELEGRAM_MAX_SIGNALS_PER_RUN || dailyLeft <= 0) continue;
    try {
      const messageId = await sendDaySignal(coin);
      await FqSignal.updateOne({ _id: doc._id }, { telegramMessageId: messageId });
      sent += 1;
      dailyLeft -= 1;
    } catch (error) {
      errors.push(`Telegram day ${coin.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { scanned: scan.scanned, newSignals, sent };
}

// ───────────── Tarix ─────────────

function toRecord(doc: FqSignalDoc): SignalRecord {
  return {
    id: String(doc._id),
    strategy: (doc.strategy ?? "fq_v3") as StrategyId,
    symbol: doc.symbol,
    marketType: doc.marketType as SignalRecord["marketType"],
    side: doc.side as SignalRecord["side"],
    setup: (doc.setup ?? null) as SignalRecord["setup"],
    signalTime: doc.signalTime.toISOString(),
    entry: doc.entry,
    stopLoss: doc.stopLoss,
    tp1: doc.tp1 ?? null,
    tp2: doc.tp2 ?? null,
    score: doc.score ?? 0,
    status: doc.status as SignalStatus,
    resultR: doc.resultR ?? null,
    telegramSent: doc.telegramMessageId != null,
    sentAt: doc.sentAt.toISOString(),
    closedAt: doc.closedAt ? doc.closedAt.toISOString() : null,
  };
}

export async function getSignalHistory(
  limit: number = 100,
  strategy?: StrategyId,
): Promise<SignalsResponse> {
  const docs = await FqSignal.find(strategy ? strategyFilter(strategy) : {}).sort({ signalTime: -1 }).limit(limit);
  const signals = docs.map(toRecord);
  const closed = signals.filter((s) => s.resultR !== null);
  const wins = closed.filter((s) => (s.resultR ?? 0) > 0).length;
  const totalR = closed.reduce((sum, s) => sum + (s.resultR ?? 0), 0);

  return {
    signals,
    stats: {
      total: signals.length,
      open: signals.filter((s) => s.status === "open" || s.status === "tp1").length,
      closed: closed.length,
      wins,
      losses: closed.length - wins,
      winRate: closed.length ? (wins / closed.length) * 100 : 0,
      totalR,
      avgR: closed.length ? totalR / closed.length : 0,
    },
    telegram: {
      configured: isTelegramConfigured(),
      enabled: env.TELEGRAM_SIGNALS_ENABLED,
    },
  };
}

export async function sendTestTelegramMessage(): Promise<void> {
  await sendTelegramMessage(
    [
      "🔔 <b>FQ Signals — test xabari</b>",
      "Bot ulangan. Signal chiqqanda shu yerga xabar keladi:",
      "• Swing 1H (FQ v3) — kirish, stop, TP1/TP2",
      "• Swing 4H (FQ v3 + Fib) — kirish, stop, TP1/TP2",
      "• SMC 4H — BOS + Fib 0.618 limit order (to'ldi / bekor xabari bilan)",
      "• Day trade (Supertrend 15M) — kirish, stop, chiqish flipda",
      "• Momentum portfeli — har dushanba long/short savat (market-neutral)",
      "Natijalar (TP/SL/chiqish) asl xabarga reply sifatida keladi.",
    ].join("\n"),
  );
}
