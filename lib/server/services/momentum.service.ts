import { env } from "../config/env";
import { MomentumBasket } from "../models/MomentumBasket";
import { getAll24hrTickers, getCryptoFuturesSymbols, getKlines } from "./binance.service";
import { isScannableSymbol, runPool } from "./fq-scanner.service";
import {
  MOMENTUM_CONFIG,
  basketReturn,
  buildBasket,
  weekStart,
  type Basket,
  type DailySeries,
} from "./momentum/engine";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram.service";

/** 30 kunlik hajm bo'yicha top 100 ni topish uchun 24 soatlik hajm bo'yicha shuncha nomzod olinadi. */
const PREFILTER = 200;
/** Kunlik sham soni: 60 kunlik lookback + 30 kunlik volatillik uchun yetarli. */
const DAILY_LIMIT = 100;

const pair = (symbol: string) => (symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol);
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

async function loadSeries(): Promise<DailySeries[]> {
  const [tickers, crypto] = await Promise.all([getAll24hrTickers("futures"), getCryptoFuturesSymbols()]);
  const candidates = tickers
    .filter((t) => isScannableSymbol(t.symbol) && crypto.has(t.symbol))
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, PREFILTER);

  return runPool(candidates, 8, async (t) => {
    try {
      const candles = (await getKlines(t.symbol, "1d", DAILY_LIMIT, "futures")).filter(
        (c) => c.closeTime <= Date.now(),
      );
      return {
        symbol: t.symbol,
        closes: candles.map((c) => c.close),
        dollarVolumes: candles.map((c) => c.close * c.volume),
      };
    } catch {
      return null;
    }
  });
}

function buildMessage(basket: Basket, previous: { longs: string[]; shorts: string[]; resultPct: number | null } | null): string {
  const list = (legs: Basket["longs"]) => legs.map((l) => pair(l.symbol)).join(", ");
  const perCoin = basket.longs[0] ? (basket.longs[0].weight * 100).toFixed(1) : "0";
  const lines = [
    `📊 <b>Momentum portfeli — haftalik yangilanish</b>`,
    `<i>Market-neutral savat: 50% long / 50% short · har coin ${perCoin}% kapital · keyingi yangilanish 7 kundan keyin</i>`,
    "",
    `🟢 <b>LONG (${basket.longs.length})</b>: ${list(basket.longs)}`,
    `🔴 <b>SHORT (${basket.shorts.length})</b>: ${list(basket.shorts)}`,
  ];

  if (previous) {
    const prevLongs = new Set(previous.longs);
    const prevShorts = new Set(previous.shorts);
    const nowLongs = new Set(basket.longs.map((l) => l.symbol));
    const nowShorts = new Set(basket.shorts.map((l) => l.symbol));
    const diff = (now: Set<string>, prev: Set<string>) => ({
      added: [...now].filter((s) => !prev.has(s)).map(pair),
      removed: [...prev].filter((s) => !now.has(s)).map(pair),
    });
    const l = diff(nowLongs, prevLongs);
    const s = diff(nowShorts, prevShorts);
    lines.push("", "<b>O'zgarishlar</b>");
    lines.push(`Long: ${l.added.length ? `+${l.added.join(", +")}` : "yangi yo'q"}${l.removed.length ? ` · −${l.removed.join(", −")}` : ""}`);
    lines.push(`Short: ${s.added.length ? `+${s.added.join(", +")}` : "yangi yo'q"}${s.removed.length ? ` · −${s.removed.join(", −")}` : ""}`);
    if (previous.resultPct !== null) lines.push("", `O'tgan hafta savati: <b>${pct(previous.resultPct)}</b> (xarajatsiz)`);
  }

  lines.push(
    "",
    `⚠️ Faqat butun savat sifatida ishlaydi — bitta coinni alohida olish strategiya emas (backtestda alohida tomonlar katta zarar ko'rgan).`,
  );
  return lines.join("\n");
}

/**
 * Haftalik rebalans: dushanba (UTC) kuni birinchi chaqiruvda savat tuziladi, saqlanadi va botga
 * yuboriladi. Haftaning qolgan chaqiruvlarida hech narsa qilmaydi (`weekStart` unikal).
 */
export async function runMomentumRebalance(now: number = Date.now()): Promise<{ rebalanced: boolean; sent: boolean }> {
  const week = weekStart(now);
  if (await MomentumBasket.exists({ weekStart: week })) return { rebalanced: false, sent: false };

  const series = await loadSeries();
  const basket = buildBasket(series, MOMENTUM_CONFIG);
  if (!basket.longs.length) throw new Error(`Momentum: universe juda kichik (${basket.universe})`);

  // O'tgan hafta savatining natijasi — joriy narxlar (oxirgi yopilgan kunlik sham) bo'yicha.
  const prevDoc = await MomentumBasket.findOne({ weekStart: { $lt: week } }).sort({ weekStart: -1 });
  let previous: Parameters<typeof buildMessage>[1] = null;
  if (prevDoc) {
    const prices = new Map(series.map((s) => [s.symbol, s.closes.at(-1)!]));
    const resultPct = basketReturn({ longs: prevDoc.longs, shorts: prevDoc.shorts }, prices);
    if (resultPct !== null) await MomentumBasket.updateOne({ _id: prevDoc._id }, { resultPct });
    previous = {
      longs: prevDoc.longs.map((l) => l.symbol),
      shorts: prevDoc.shorts.map((l) => l.symbol),
      resultPct,
    };
  }

  let doc;
  try {
    doc = await MomentumBasket.create({ weekStart: week, ...basket });
  } catch (error) {
    // Parallel chaqiruv allaqachon yaratgan.
    if ((error as { code?: number }).code === 11000) return { rebalanced: false, sent: false };
    throw error;
  }

  if (!env.TELEGRAM_SIGNALS_ENABLED || !isTelegramConfigured()) return { rebalanced: true, sent: false };
  const messageId = await sendTelegramMessage(buildMessage(basket, previous));
  await MomentumBasket.updateOne({ _id: doc._id }, { telegramMessageId: messageId });
  return { rebalanced: true, sent: true };
}
