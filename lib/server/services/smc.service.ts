import { env } from "../config/env";
import { FqSignal, type FqSignalDoc } from "../models/FqSignal";
import { getKlines, getKlinesRange } from "./binance.service";
import { CHART_COLORS, renderSignalChart } from "./chart-image.service";
import { runPool } from "./fq-scanner.service";
import { getRegimeGate } from "./market-regime.service";
import { SMC_CONFIG, computeSmcSeries, htfDirection, resolvePending, smcSetupAt, type SmcSetup } from "./smc/engine";
import { isTelegramConfigured, sendTelegramMessage, sendTelegramPhoto } from "./telegram.service";
import type { Candle, MarketType } from "../types/index";

export const SMC_INTERVAL = "4h";
export const SMC_INTERVAL_MS = 4 * 3_600_000;
const SMC_HTF = "1d";

/** Backtest qilingan 40 coin (20 ta asosiy + tanlovda qatnashmagan 20 ta). */
export const SMC_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT",
  "AVAXUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "NEARUSDT", "UNIUSDT", "AAVEUSDT", "ATOMUSDT",
  "FILUSDT", "ETCUSDT", "SUIUSDT", "TRXUSDT", "APTUSDT", "ARBUSDT", "OPUSDT", "INJUSDT",
  "TIAUSDT", "SEIUSDT", "ICPUSDT", "HBARUSDT", "XLMUSDT", "ALGOUSDT", "VETUSDT", "SANDUSDT",
  "AXSUSDT", "GALAUSDT", "CRVUSDT", "LDOUSDT", "RUNEUSDT", "STXUSDT", "IMXUSDT", "GRTUSDT",
] as const;

const RISK_PCT = 1;
const STRATEGY = "smc_4h" as const;

const pair = (s: string) => (s.endsWith("USDT") ? `${s.slice(0, -4)}/USDT` : s);

function fmt(price: number): string {
  const digits = price >= 1000 ? 1 : price >= 1 ? 4 : price >= 0.01 ? 5 : 8;
  return Number(price.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function pctFrom(entry: number, price: number): string {
  const v = ((price - entry) / entry) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const closed = (candles: Candle[]) => candles.filter((c) => c.closeTime <= Date.now());

function telegramActive(): boolean {
  return env.TELEGRAM_SIGNALS_ENABLED && isTelegramConfigured();
}

export function buildSmcMessage(symbol: string, setup: SmcSetup, regime: string | null = null): string {
  const long = setup.side === "long";
  const risk = Math.abs(setup.entry - setup.stopLoss);
  const r = (p: number) => (Math.abs(p - setup.entry) / risk).toFixed(1);
  const notional = (RISK_PCT / ((risk / setup.entry) * 100)) * 100;
  const days = Math.round((SMC_CONFIG.maxWait * SMC_INTERVAL_MS) / 86_400_000);
  const url = env.APP_URL ? `${env.APP_URL.replace(/\/$/, "")}/coin/${symbol}` : null;
  const lines = [
    `📥 <b>LIMIT ${long ? "BUY" : "SELL"} · ${pair(symbol)}</b> — ${long ? "LONG" : "SHORT"} OTE`,
    `📌 <b>SMC 4H · BOS + Fib ${SMC_CONFIG.entryFib}</b>`,
    `<i>Struktura ${long ? "yuqoriga" : "pastga"} sindi · 1D trend ${long ? "bullish" : "bearish"} · impuls ${long ? `${fmt(setup.legLow)} → ${fmt(setup.legHigh)}` : `${fmt(setup.legHigh)} → ${fmt(setup.legLow)}`}</i>`,
    "",
    `Limit kirish: <code>${fmt(setup.entry)}</code>  (impulsning ${SMC_CONFIG.entryFib} darajasi)`,
    `Stop:   <code>${fmt(setup.stopLoss)}</code>  (${pctFrom(setup.entry, setup.stopLoss)}) · impuls boshi ortida`,
    `TP1:    <code>${fmt(setup.tp1)}</code>  (${pctFrom(setup.entry, setup.tp1)}) · ${r(setup.tp1)}R · eski ${long ? "cho'qqi" : "tub"}, 50% yopish, stop → BE`,
    `TP2:    <code>${fmt(setup.tp2)}</code>  (${pctFrom(setup.entry, setup.tp2)}) · ${r(setup.tp2)}R · Fib 1.272`,
    "",
    `⏳ Order amal qiladi: ${days} kun yoki narx ${fmt(setup.invalidate)} dan o'tguncha (to'lmasa bekor)`,
    `Hajm: ${RISK_PCT}% risk → pozitsiya ≈ kapitalning <b>${notional.toFixed(0)}%</b>`,
  ];
  if (regime) lines.push(`🌐 Bozor: ${regime}`);
  if (url) lines.push("", `<a href="${url}">Grafik →</a>`);
  return lines.join("\n");
}

async function sendSetup(symbol: string, setup: SmcSetup, candles: Candle[], regime: string | null): Promise<number> {
  const text = buildSmcMessage(symbol, setup, regime);
  try {
    const long = setup.side === "long";
    const from = Math.max(0, candles.length - 90);
    const chart = renderSignalChart({
      title: `LIMIT ${long ? "BUY" : "SELL"} · ${pair(symbol)} — OTE ${SMC_CONFIG.entryFib}`,
      subtitle: `SMC 4H · BOS · 1D trend ${long ? "bullish" : "bearish"}`,
      side: setup.side,
      candles: candles.slice(from),
      levels: [
        { price: setup.tp2, label: "TP2 1.272", color: CHART_COLORS.tp },
        { price: setup.tp1, label: "TP1", color: CHART_COLORS.tp },
        { price: setup.stopLoss, label: "STOP", color: CHART_COLORS.stop },
        { price: setup.entry, label: "LIMIT", color: CHART_COLORS.entry },
      ],
      signalTime: setup.signalTime,
      marker: "BOS",
      position: { entry: setup.entry, stopLoss: setup.stopLoss, target: setup.tp2, targetLabel: "TP2" },
      formatPrice: fmt,
    });
    return await sendTelegramPhoto(chart, text);
  } catch (error) {
    console.error(`SMC grafigi ${symbol}:`, error instanceof Error ? error.message : error);
    return sendTelegramMessage(text);
  }
}

/** Yangi 4H sham yopilgandan keyingi 30 daqiqa ichida skanerlash (cron har 5 daqiqada — 6 urinish). */
function inScanWindow(now: number): boolean {
  const msIntoBar = now % SMC_INTERVAL_MS;
  return msIntoBar < 30 * 60_000;
}

export async function runSmcSignals(
  errors: string[],
  now: number = Date.now(),
): Promise<{ scanned: number; newSignals: number; sent: number }> {
  if (!inScanWindow(now)) return { scanned: 0, newSignals: 0, sent: 0 };
  const market = env.TELEGRAM_SIGNAL_MARKET as MarketType;

  const active = await FqSignal.find({ strategy: STRATEGY, status: { $in: ["pending", "open", "tp1"] } });
  const inTrade = new Set(active.filter((d) => d.status !== "pending").map((d) => d.symbol));
  const pendingBySymbol = new Map(active.filter((d) => d.status === "pending").map((d) => [d.symbol, d]));

  const found = await runPool([...SMC_SYMBOLS], 6, async (symbol) => {
    if (inTrade.has(symbol)) return null;
    try {
      const [raw, htfRaw] = await Promise.all([
        getKlines(symbol, SMC_INTERVAL, 500, market),
        getKlines(symbol, SMC_HTF, 300, market),
      ]);
      const candles = closed(raw);
      const series = computeSmcSeries(candles);
      const setup = smcSetupAt(series, candles.length - 1, htfDirection(closed(htfRaw)));
      return setup ? { symbol, setup, candles } : null;
    } catch (error) {
      errors.push(`SMC ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });

  // Bozor rejimi (TOTAL3 1D) — mos bo'lmagan tomondagi setup'lar olinmaydi.
  const regime = await getRegimeGate(STRATEGY, market, errors);

  let newSignals = 0;
  let sent = 0;
  for (const { symbol, setup, candles } of found) {
    if (!regime.allows(setup.side, symbol)) continue;
    let doc: FqSignalDoc;
    try {
      doc = await FqSignal.create({
        strategy: STRATEGY,
        symbol,
        marketType: market,
        side: setup.side,
        setup: null,
        signalTime: new Date(setup.signalTime),
        entry: setup.entry,
        stopLoss: setup.stopLoss,
        tp1: setup.tp1,
        tp2: setup.tp2,
        invalidate: setup.invalidate,
        status: "pending",
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) continue; // shu setup allaqachon bor
      errors.push(`SMC ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    newSignals += 1;

    // Yangi setup eski kutilayotgan orderni almashtiradi (backtestdagi kabi).
    const old = pendingBySymbol.get(symbol);
    if (old) {
      await FqSignal.updateOne({ _id: old._id }, { status: "cancelled", closedAt: new Date() });
      if (old.telegramMessageId && telegramActive()) {
        await sendTelegramMessage(`❌ <b>Order bekor</b> — yangi setup chiqdi, order almashtirildi\n<i>${pair(symbol)} · SMC 4H</i>`, {
          replyTo: old.telegramMessageId,
        }).catch(() => undefined);
      }
    }

    if (!telegramActive()) continue;
    try {
      const messageId = await sendSetup(symbol, setup, candles, regime.summary);
      await FqSignal.updateOne({ _id: doc._id }, { telegramMessageId: messageId });
      sent += 1;
    } catch (error) {
      errors.push(`Telegram SMC ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { scanned: SMC_SYMBOLS.length, newSignals, sent };
}

/** Kutilayotgan limit orderlar: to'ldimi, bekor bo'ldimi. To'lganlari `open` bo'ladi (keyin TP/SL umumiy siklda). */
export async function updatePendingSmc(errors: string[]): Promise<number> {
  const pending = await FqSignal.find({ strategy: STRATEGY, status: "pending" }).limit(50);
  let updated = 0;
  for (const doc of pending) {
    try {
      const start = doc.signalTime.getTime() + SMC_INTERVAL_MS;
      const after = closed(
        await getKlinesRange(doc.symbol, SMC_INTERVAL, start, Date.now(), doc.marketType as MarketType),
      );
      const res = resolvePending(
        { side: doc.side as "long" | "short", entry: doc.entry, stopLoss: doc.stopLoss, invalidate: doc.invalidate ?? NaN },
        after,
      );
      if (res.state === "pending") continue;
      const head = `<i>${doc.side === "long" ? "LONG" : "SHORT"} · ${pair(doc.symbol)} · SMC 4H</i>`;
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
            ? "❌ <b>Order bekor</b> — narx kirishga qaytmasdan impuls cho'qqisidan o'tdi"
            : "❌ <b>Order bekor</b> — muddat tugadi, narx kirishga qaytmadi",
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
      errors.push(`SMC pending ${doc.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return updated;
}
