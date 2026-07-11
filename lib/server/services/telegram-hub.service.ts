import { TelegramSignal } from "../models/TelegramSignal";
import { env } from "../config/env";
import { getAll24hrTickers, getKlines } from "./binance.service";
import {
  buildEmaSmcAnalysis,
  type EmaSmcAnalysis,
} from "./ema-smc.strategy.service";
import { buildTechnicalAnalysis } from "./analysis.service";
import { generateCanvasChart } from "./chart-image.service";
import {
  isTelegramConfigured,
  sendTelegramMessage,
  sendTelegramPhoto,
} from "./telegram.service";
import {
  fetchTradingViewChartForSymbol,
  isTradingViewChartConfigured,
} from "./tradingview-chart.service";
import type { MarketType, VolumeStatus } from "../types/index";

export type TelegramSignalSource = "ema_smc" | "screener";

export interface HubSignalCandidate {
  sourceType: TelegramSignalSource;
  symbol: string;
  marketType: MarketType;
  side: "long" | "short";
  score: number;
  riskReward: number;
  strategyLabel: string;
  verdict: string;
  reason: string;
  currentPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  chartInterval: string;
  caption: string;
  priority: number;
}

export interface TelegramHubResult {
  scanned: { emaSmc: number; screener: number };
  candidates: number;
  sent: number;
  skipped: number;
  dailyRemaining: number;
  errors: string[];
  bySource: Record<TelegramSignalSource, number>;
}

const EXCLUDED = new Set([
  "USDCUSDT",
  "BUSDUSDT",
  "TUSDUSDT",
  "FDUSDUSDT",
  "DAIUSDT",
  "EURUSDT",
  "USDPUSDT",
]);

const EMA_SMC_SCAN = 100;
const SCREENER_SCAN = 80;
const MIN_VOLUME = 100_000;

function isScannable(symbol: string): boolean {
  if (!symbol.endsWith("USDT") || EXCLUDED.has(symbol)) return false;
  return !(
    symbol.includes("UP") ||
    symbol.includes("DOWN") ||
    symbol.includes("BEAR") ||
    symbol.includes("BULL")
  );
}

function formatPrice(price: number): string {
  if (price >= 1000)
    return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatVolume(quoteVolume: number): string {
  return quoteVolume >= 1_000_000
    ? `${(quoteVolume / 1_000_000).toFixed(1)}M`
    : `${(quoteVolume / 1_000).toFixed(0)}K`;
}

function volumeLabel(status: VolumeStatus): string {
  if (status === "high") return "Kuchli";
  if (status === "low") return "Past";
  return "O'rtacha";
}

function buildEmaSmcCaption(
  analysis: EmaSmcAnalysis,
  quoteVolume: number,
  priceChangePercent: number,
): string {
  const base = analysis.symbol.replace("USDT", "");
  const sideEmoji = analysis.side === "long" ? "🟢" : "🔴";
  const sideLabel = analysis.side === "long" ? "LONG" : "SHORT";
  const changeSign = priceChangePercent >= 0 ? "+" : "";
  const checklist = analysis.checklist
    .map((item) => `${item.passed ? "✅" : "⬜"} ${item.label}`)
    .join("\n");

  return [
    `🚨 <b>EMA + SMC SIGNAL</b>`,
    `📌 Manba: Strategiyalar · EMA+SMC`,
    ``,
    `${sideEmoji} <b>$${base}</b> | #${analysis.symbol} | ${sideLabel}`,
    `💰 Narx: <b>${formatPrice(analysis.currentPrice)}</b> (${changeSign}${priceChangePercent.toFixed(2)}% 24h)`,
    `📊 Volume: ${formatVolume(quoteVolume)} USDT · ${analysis.marketType.toUpperCase()}`,
    `📈 EMA 200: ${formatPrice(analysis.ema200)} (${analysis.trendDirection})`,
    ``,
    checklist,
    analysis.sweep
      ? `🔹 Sweep: <b>${analysis.sweep.levelType.toUpperCase()}</b> @ ${formatPrice(analysis.sweep.level)}`
      : "",
    analysis.structure
      ? `🔹 ${analysis.structure.type.toUpperCase()} @ ${formatPrice(analysis.structure.level)}`
      : "",
    analysis.entryZone
      ? `🎯 Entry (${analysis.entryType?.toUpperCase() ?? ""}): ${formatPrice(analysis.entryZone[0])} – ${formatPrice(analysis.entryZone[1])}`
      : "",
    `🛑 SL: <b>${formatPrice(analysis.stopLoss)}</b>`,
    `🎯 TP: <b>${formatPrice(analysis.takeProfit)}</b>`,
    `📐 R:R: <b>1:${analysis.riskReward.toFixed(1)}</b> · Ball: <b>${analysis.score}/100</b>`,
    ``,
    `<i>${escapeHtml(analysis.reason)}</i>`,
    ``,
    `⏱ ${new Date().toUTCString()}`,
    `🤖 EasyTrade AI`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildScreenerCaption(params: {
  symbol: string;
  marketType: MarketType;
  side: "long" | "short";
  currentPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  strategyLabel: string;
  confidence: number;
  reason: string;
  rrNow: number;
  stopLoss: number;
  takeProfit: number;
  rsi: number;
  trend: string;
  volumeStatus: VolumeStatus;
  interval: string;
}): string {
  const base = params.symbol.replace("USDT", "");
  const sideEmoji = params.side === "long" ? "🟢" : "🔴";
  const changeSign = params.priceChangePercent >= 0 ? "+" : "";

  return [
    `📊 <b>SKRINING SIGNAL</b>`,
    `📌 Manba: Skrining · ${params.interval.toUpperCase()}`,
    ``,
    `${sideEmoji} <b>$${base}</b> | #${params.symbol} | ${params.side.toUpperCase()}`,
    `💰 Narx: <b>${formatPrice(params.currentPrice)}</b> (${changeSign}${params.priceChangePercent.toFixed(2)}% 24h)`,
    `📊 Volume: ${formatVolume(params.quoteVolume)} USDT · ${params.marketType.toUpperCase()} (${volumeLabel(params.volumeStatus)})`,
    `📈 Strategiya: <b>${params.strategyLabel}</b> (${params.confidence}%)`,
    `📉 RSI: ${params.rsi.toFixed(1)} · Trend: ${params.trend}`,
    ``,
    `🛑 SL: <b>${formatPrice(params.stopLoss)}</b>`,
    `🎯 TP: <b>${formatPrice(params.takeProfit)}</b>`,
    `📐 R:R: <b>1:${params.rrNow.toFixed(1)}</b>`,
    ``,
    `<i>${escapeHtml(params.reason)}</i>`,
    ``,
    `⏱ ${new Date().toUTCString()}`,
    `🤖 EasyTrade AI`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function countSentToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  return TelegramSignal.countDocuments({ sentAt: { $gte: startOfDay } });
}

async function wasRecentlySent(
  symbol: string,
  marketType: MarketType,
  side: string,
): Promise<boolean> {
  const since = new Date(
    Date.now() - env.TELEGRAM_SIGNAL_COOLDOWN_HOURS * 60 * 60 * 1000,
  );

  const existing = await TelegramSignal.findOne({
    symbol: symbol.toUpperCase(),
    marketType,
    side,
    sentAt: { $gte: since },
  }).lean();

  return Boolean(existing);
}

async function collectEmaSmcCandidates(
  marketType: MarketType,
): Promise<HubSignalCandidate[]> {
  const tickers = await getAll24hrTickers(marketType);
  const eligible = tickers
    .filter((t) => isScannable(t.symbol) && t.quoteVolume >= MIN_VOLUME)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, EMA_SMC_SCAN);

  const candidates: HubSignalCandidate[] = [];

  for (const ticker of eligible) {
    try {
      const analysis = await buildEmaSmcAnalysis(ticker.symbol, marketType);

      if (
        analysis.verdict !== "enter" ||
        !analysis.side ||
        analysis.score < env.TELEGRAM_SIGNAL_MIN_SCORE ||
        analysis.riskReward < env.TELEGRAM_SIGNAL_MIN_RR
      ) {
        continue;
      }

      candidates.push({
        sourceType: "ema_smc",
        symbol: analysis.symbol,
        marketType,
        side: analysis.side,
        score: analysis.score,
        riskReward: analysis.riskReward,
        strategyLabel: "EMA + SMC",
        verdict: analysis.verdict,
        reason: analysis.reason,
        currentPrice: analysis.currentPrice,
        priceChangePercent: ticker.priceChangePercent,
        quoteVolume: ticker.quoteVolume,
        chartInterval: "5m",
        caption: buildEmaSmcCaption(
          analysis,
          ticker.quoteVolume,
          ticker.priceChangePercent,
        ),
        priority: analysis.score + analysis.riskReward * 5 + 20,
      });

      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // skip symbol
    }
  }

  return candidates;
}

async function collectScreenerCandidates(
  marketType: MarketType,
): Promise<HubSignalCandidate[]> {
  const interval = env.TELEGRAM_SCREENER_INTERVAL;
  const tickers = await getAll24hrTickers(marketType);
  const eligible = tickers
    .filter((t) => isScannable(t.symbol) && t.quoteVolume >= MIN_VOLUME)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, SCREENER_SCAN);

  const candidates: HubSignalCandidate[] = [];

  for (const ticker of eligible) {
    try {
      const analysis = await buildTechnicalAnalysis(
        ticker.symbol,
        interval,
        10_000,
        2,
        marketType,
        false,
      );

      if (
        analysis.verdict.verdict !== "enter" ||
        !analysis.verdict.side ||
        analysis.strategy.confidence < env.TELEGRAM_MIN_CONFIDENCE ||
        analysis.verdict.rrNow < env.TELEGRAM_SIGNAL_MIN_RR
      ) {
        continue;
      }

      const side = analysis.verdict.side;

      candidates.push({
        sourceType: "screener",
        symbol: analysis.symbol,
        marketType,
        side,
        score: analysis.strategy.confidence,
        riskReward: analysis.verdict.rrNow,
        strategyLabel: analysis.strategy.label,
        verdict: analysis.verdict.verdict,
        reason: analysis.verdict.reason,
        currentPrice: analysis.currentPrice,
        priceChangePercent: ticker.priceChangePercent,
        quoteVolume: ticker.quoteVolume,
        chartInterval: interval,
        caption: buildScreenerCaption({
          symbol: analysis.symbol,
          marketType,
          side,
          currentPrice: analysis.currentPrice,
          priceChangePercent: ticker.priceChangePercent,
          quoteVolume: ticker.quoteVolume,
          strategyLabel: analysis.strategy.label,
          confidence: analysis.strategy.confidence,
          reason: analysis.verdict.reason,
          rrNow: analysis.verdict.rrNow,
          stopLoss: analysis.verdict.stopLoss,
          takeProfit: analysis.verdict.takeProfit,
          rsi: analysis.indicators.rsi,
          trend: analysis.trend,
          volumeStatus: analysis.indicators.volumeStatus,
          interval,
        }),
        priority:
          analysis.strategy.confidence +
          analysis.verdict.rrNow * 4 +
          (analysis.indicators.volumeStatus === "high" ? 10 : 0),
      });

      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // skip symbol
    }
  }

  return candidates;
}

function dedupeCandidates(candidates: HubSignalCandidate[]): HubSignalCandidate[] {
  const best = new Map<string, HubSignalCandidate>();

  for (const candidate of candidates) {
    const key = `${candidate.symbol}:${candidate.marketType}:${candidate.side}`;
    const existing = best.get(key);
    if (!existing || candidate.priority > existing.priority) {
      best.set(key, candidate);
    }
  }

  return [...best.values()].sort((a, b) => b.priority - a.priority);
}

async function resolveChartImage(
  candidate: HubSignalCandidate,
): Promise<Buffer | null> {
  if (isTradingViewChartConfigured()) {
    try {
      return await fetchTradingViewChartForSymbol(
        candidate.symbol,
        candidate.marketType,
        candidate.chartInterval,
      );
    } catch (error) {
      console.warn(
        `TradingView chart (${candidate.symbol}):`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  if (candidate.sourceType === "ema_smc") {
    try {
      const candles = await getKlines(
        candidate.symbol,
        "5m",
        120,
        candidate.marketType,
      );
      const analysis = await buildEmaSmcAnalysis(
        candidate.symbol,
        candidate.marketType,
      );
      return await generateCanvasChart(candles, analysis);
    } catch {
      return null;
    }
  }

  return null;
}

async function dispatchSignal(candidate: HubSignalCandidate): Promise<number> {
  const chart = await resolveChartImage(candidate);

  let messageId: number;

  if (chart) {
    messageId = await sendTelegramPhoto(
      chart,
      candidate.caption,
      `${candidate.symbol}-${candidate.chartInterval}.png`,
    );
  } else {
    const prefix = isTradingViewChartConfigured()
      ? `⚠️ <i>Chart vaqtincha mavjud emas. Signal matni:</i>\n\n`
      : "";
    messageId = await sendTelegramMessage(prefix + candidate.caption);
  }

  await TelegramSignal.create({
    sourceType: candidate.sourceType,
    symbol: candidate.symbol,
    marketType: candidate.marketType,
    side: candidate.side,
    verdict: candidate.verdict,
    score: candidate.score,
    riskReward: candidate.riskReward,
    strategyLabel: candidate.strategyLabel,
    telegramMessageId: messageId,
    sentAt: new Date(),
  });

  return messageId;
}

export async function evaluateTelegramSignalHub(): Promise<TelegramHubResult> {
  const result: TelegramHubResult = {
    scanned: { emaSmc: 0, screener: 0 },
    candidates: 0,
    sent: 0,
    skipped: 0,
    dailyRemaining: env.TELEGRAM_MAX_SIGNALS_PER_DAY,
    errors: [],
    bySource: { ema_smc: 0, screener: 0 },
  };

  if (!env.TELEGRAM_SIGNALS_ENABLED) return result;

  if (!isTelegramConfigured()) {
    result.errors.push("Telegram sozlanmagan");
    return result;
  }

  const sentToday = await countSentToday();
  result.dailyRemaining = Math.max(0, env.TELEGRAM_MAX_SIGNALS_PER_DAY - sentToday);

  if (result.dailyRemaining === 0) {
    result.errors.push("Kunlik signal limiti tugadi");
    return result;
  }

  const marketType = env.TELEGRAM_SIGNAL_MARKET;
  const allCandidates: HubSignalCandidate[] = [];

  if (env.TELEGRAM_SEND_EMA_SMC) {
    const emaSmc = await collectEmaSmcCandidates(marketType);
    result.scanned.emaSmc = EMA_SMC_SCAN;
    allCandidates.push(...emaSmc);
  }

  if (env.TELEGRAM_SEND_SCREENER) {
    const screener = await collectScreenerCandidates(marketType);
    result.scanned.screener = SCREENER_SCAN;
    allCandidates.push(...screener);
  }

  const ranked = dedupeCandidates(allCandidates);
  result.candidates = ranked.length;

  const maxThisRun = Math.min(
    env.TELEGRAM_MAX_SIGNALS_PER_RUN,
    result.dailyRemaining,
  );

  for (const candidate of ranked) {
    if (result.sent >= maxThisRun) break;

    try {
      const recent = await wasRecentlySent(
        candidate.symbol,
        candidate.marketType,
        candidate.side,
      );

      if (recent) {
        result.skipped += 1;
        continue;
      }

      await dispatchSignal(candidate);
      result.sent += 1;
      result.bySource[candidate.sourceType] += 1;
      result.dailyRemaining -= 1;

      console.log(
        `Telegram hub: ${candidate.sourceType} ${candidate.symbol} ${candidate.side} yuborildi`,
      );

      await new Promise((r) => setTimeout(r, 1200));
    } catch (error) {
      result.errors.push(
        `${candidate.symbol}: ${error instanceof Error ? error.message : "xato"}`,
      );
    }
  }

  return result;
}

export async function sendTestSignal(
  symbol: string,
  marketType: MarketType = env.TELEGRAM_SIGNAL_MARKET,
  force: boolean = false,
): Promise<{ sent: boolean; messageId: number; sourceType: TelegramSignalSource }> {
  if (!isTelegramConfigured()) {
    throw new Error("Telegram sozlanmagan");
  }

  const analysis = await buildEmaSmcAnalysis(symbol, marketType);

  if (!analysis.side) {
    throw new Error("Trend aniqlanmadi");
  }

  if (
    !force &&
    (analysis.verdict !== "enter" ||
      analysis.score < env.TELEGRAM_SIGNAL_MIN_SCORE ||
      analysis.riskReward < env.TELEGRAM_SIGNAL_MIN_RR)
  ) {
    throw new Error(
      `Shartlar bajarilmagan (verdict=${analysis.verdict}, score=${analysis.score}, rr=${analysis.riskReward.toFixed(1)})`,
    );
  }

  const ticker = (await getAll24hrTickers(marketType)).find(
    (t) => t.symbol === analysis.symbol,
  );

  const candidate: HubSignalCandidate = {
    sourceType: "ema_smc",
    symbol: analysis.symbol,
    marketType,
    side: analysis.side,
    score: analysis.score,
    riskReward: analysis.riskReward,
    strategyLabel: "EMA + SMC",
    verdict: analysis.verdict,
    reason: analysis.reason,
    currentPrice: analysis.currentPrice,
    priceChangePercent: ticker?.priceChangePercent ?? 0,
    quoteVolume: ticker?.quoteVolume ?? 0,
    chartInterval: "5m",
    caption: buildEmaSmcCaption(
      analysis,
      ticker?.quoteVolume ?? 0,
      ticker?.priceChangePercent ?? 0,
    ),
    priority: 100,
  };

  const messageId = await dispatchSignal(candidate);
  return { sent: true, messageId, sourceType: "ema_smc" };
}

/** @deprecated evaluateTelegramSignalHub ishlating */
export async function evaluateStrategySignals() {
  const hub = await evaluateTelegramSignalHub();
  return {
    scanned: hub.scanned.emaSmc + hub.scanned.screener,
    candidates: hub.candidates,
    sent: hub.sent,
    skipped: hub.skipped,
    errors: hub.errors,
  };
}
