import {
  calculateEMA,
  calculateRSI,
  findSwingHighs,
  findSwingLows,
} from "./indicators.service";
import { detectCandlePattern, patternMatchesSide } from "./patterns.service";
import type {
  AnalysisIndicators,
  Candle,
  CandlePattern,
  MarketType,
  TradeSide,
  Trend,
} from "../types/index";

export type StrategyType =
  | "trend_pullback"
  | "breakout_retest"
  | "ema_crossover"
  | "rsi_divergence";

export type Verdict = "enter" | "wait" | "avoid";

export interface StrategyChecklistItem {
  label: string;
  passed: boolean;
  detail: string;
}

export interface StrategyDetection {
  type: StrategyType;
  label: string;
  description: string;
  confidence: number;
  checklist: StrategyChecklistItem[];
}

export interface VerdictResult {
  verdict: Verdict;
  verdictLabel: string;
  side: TradeSide;
  headline: string;
  reason: string;
  rrNow: number;
  rrIdeal: number;
  entryZone: [number, number];
  invalidation: number;
  stopLoss: number;
  takeProfit: number;
  strategy: StrategyDetection;
  pattern?: CandlePattern | null;
  confluence?: number;
  htfTrend?: Trend;
  htfInterval?: string;
  mtfNote?: string;
  btcTrend?: Trend;
  btcAligned?: boolean;
  btcNote?: string;
}

export interface StrategyInput {
  candles: Candle[];
  currentPrice: number;
  trend: Trend;
  indicators: AnalysisIndicators;
  marketType: MarketType;
}

const STRATEGY_LABELS: Record<StrategyType, string> = {
  trend_pullback: "Trend Pullback",
  breakout_retest: "Breakout + Retest",
  ema_crossover: "EMA Crossover",
  rsi_divergence: "RSI Divergence",
};

const STRATEGY_DESCRIPTIONS: Record<StrategyType, string> = {
  trend_pullback:
    "Aniq trendda narx support/EMA50 ga qaytib, davom etish imkoniyatini qidiradi",
  breakout_retest:
    "Muhim daraja buzilgan va narx qaytib retest qilayotganda kiriladi",
  ema_crossover:
    "EMA50/200 kesishgandan keyin pullback orqali trend yo'nalishida kiriladi",
  rsi_divergence:
    "Narx va RSI o'rtasidagi divergensiya reversal yoki davom signalini beradi",
};

// Minimum reward:risk required to allow an entry. Futures entries demand a
// full 1:2 because leverage amplifies both fees and mistakes.
const MIN_RR_SPOT = 1.5;
const MIN_RR_FUTURES = 2;
const MIN_RR_DIVERGENCE = 1.8;
// Take-profit distance as a multiple of the risk (entry → stop) distance.
const TP_RR_MULTIPLE = 2;

function minRrFor(marketType: MarketType): number {
  return marketType === "futures" ? MIN_RR_FUTURES : MIN_RR_SPOT;
}

function minRrDivergence(marketType: MarketType): number {
  return Math.max(MIN_RR_DIVERGENCE, minRrFor(marketType));
}

interface StrategyCandidate {
  type: StrategyType;
  score: number;
  checklist: StrategyChecklistItem[];
}

interface TradeLevels {
  stopLoss: number;
  takeProfit: number;
  rrNow: number;
  rrIdeal: number;
}

function computeLongEntryZone(support: number, atr: number): [number, number] {
  const low = support;
  const high = support + atr;
  return [Math.min(low, high), Math.max(low, high)];
}

function computeShortEntryZone(
  resistance: number,
  atr: number,
): [number, number] {
  const low = resistance - atr;
  const high = resistance;
  return [Math.min(low, high), Math.max(low, high)];
}

/**
 * Side-aware trade levels anchored to the setup's invalidation level.
 * The stop-loss IS the invalidation (the level that voids the thesis), and the
 * take-profit is a fixed R multiple away from the ideal entry. R:R is therefore
 * always computed on the correct side and stays consistent with what the UI shows.
 */
function buildLongLevels(
  currentPrice: number,
  idealEntry: number,
  invalidation: number,
): TradeLevels {
  const stopLoss = invalidation;
  const riskPerUnit = idealEntry - stopLoss;

  if (riskPerUnit <= 0) {
    return { stopLoss, takeProfit: idealEntry, rrNow: 0, rrIdeal: 0 };
  }

  const takeProfit = idealEntry + TP_RR_MULTIPLE * riskPerUnit;
  const rrIdeal = (takeProfit - idealEntry) / riskPerUnit;
  const currentRisk = currentPrice - stopLoss;
  const rrNow = currentRisk > 0 ? (takeProfit - currentPrice) / currentRisk : 0;

  return { stopLoss, takeProfit, rrNow, rrIdeal };
}

/**
 * Shrinks an entry zone so every price inside it still satisfies the minimum
 * reward:risk. Without this, the far edge of an ATR-wide zone can degrade the
 * trade to ~1:1 even though the strategy demands 1:1.5+. The worst acceptable
 * entry solves (TP - entry) = minRr * (entry - SL), i.e.
 * entry = (TP + minRr * SL) / (1 + minRr) — same formula on both sides.
 */
export function clampEntryZoneToMinRr(
  zone: [number, number],
  levels: TradeLevels,
  side: "long" | "short",
  minRr: number,
): [number, number] {
  if (levels.rrIdeal <= 0) {
    return zone;
  }

  const boundary = (levels.takeProfit + minRr * levels.stopLoss) / (1 + minRr);

  if (side === "long") {
    return [Math.min(zone[0], boundary), Math.min(zone[1], boundary)];
  }

  return [Math.max(zone[0], boundary), Math.max(zone[1], boundary)];
}

function buildShortLevels(
  currentPrice: number,
  idealEntry: number,
  invalidation: number,
): TradeLevels {
  const stopLoss = invalidation;
  const riskPerUnit = stopLoss - idealEntry;

  if (riskPerUnit <= 0) {
    return { stopLoss, takeProfit: idealEntry, rrNow: 0, rrIdeal: 0 };
  }

  const takeProfit = idealEntry - TP_RR_MULTIPLE * riskPerUnit;
  const rrIdeal = (idealEntry - takeProfit) / riskPerUnit;
  const currentRisk = stopLoss - currentPrice;
  const rrNow = currentRisk > 0 ? (currentPrice - takeProfit) / currentRisk : 0;

  return { stopLoss, takeProfit, rrNow, rrIdeal };
}

function findRecentEmaCross(
  ema50: number[],
  ema200: number[],
  lookback: number = 12,
): "bullish" | "bearish" | null {
  const start = Math.max(1, ema50.length - lookback);

  for (let i = start; i < ema50.length; i++) {
    const prev50 = ema50[i - 1];
    const prev200 = ema200[i - 1];
    const curr50 = ema50[i];
    const curr200 = ema200[i];

    if (
      prev50 === undefined ||
      prev200 === undefined ||
      curr50 === undefined ||
      curr200 === undefined ||
      Number.isNaN(prev50) ||
      Number.isNaN(prev200) ||
      Number.isNaN(curr50) ||
      Number.isNaN(curr200)
    ) {
      continue;
    }

    if (prev50 <= prev200 && curr50 > curr200) {
      return "bullish";
    }

    if (prev50 >= prev200 && curr50 < curr200) {
      return "bearish";
    }
  }

  return null;
}

function rsiAtIndex(
  closes: number[],
  index: number,
  period: number = 14,
): number {
  if (index < period) {
    return NaN;
  }

  return calculateRSI(closes.slice(0, index + 1), period);
}

function detectBreakoutDirection(
  candles: Candle[],
  support: number,
  resistance: number,
  atr: number,
  currentPrice: number,
): "long" | "short" | null {
  const recent = candles.slice(-25);
  const brokeUp = recent.some(
    (candle) => candle.close > resistance + atr * 0.25,
  );
  const brokeDown = recent.some(
    (candle) => candle.close < support - atr * 0.25,
  );

  const retestLongZone =
    currentPrice >= resistance - atr * 1.5 &&
    currentPrice <= resistance + atr * 0.5;
  const retestShortZone =
    currentPrice >= support - atr * 0.5 && currentPrice <= support + atr * 1.5;

  if (brokeUp && retestLongZone) {
    return "long";
  }

  if (brokeDown && retestShortZone) {
    return "short";
  }

  return null;
}

function detectDivergence(
  candles: Candle[],
  closes: number[],
): "bullish" | "bearish" | null {
  const recent = candles.slice(-60);
  const offset = candles.length - recent.length;
  const swingLows = findSwingLows(recent);
  const swingHighs = findSwingHighs(recent);

  if (swingLows.length >= 2) {
    const first = swingLows[swingLows.length - 2]!;
    const second = swingLows[swingLows.length - 1]!;
    const rsiFirst = rsiAtIndex(closes, first.index + offset);
    const rsiSecond = rsiAtIndex(closes, second.index + offset);

    if (
      !Number.isNaN(rsiFirst) &&
      !Number.isNaN(rsiSecond) &&
      second.price < first.price &&
      rsiSecond > rsiFirst + 2
    ) {
      return "bullish";
    }
  }

  if (swingHighs.length >= 2) {
    const first = swingHighs[swingHighs.length - 2]!;
    const second = swingHighs[swingHighs.length - 1]!;
    const rsiFirst = rsiAtIndex(closes, first.index + offset);
    const rsiSecond = rsiAtIndex(closes, second.index + offset);

    if (
      !Number.isNaN(rsiFirst) &&
      !Number.isNaN(rsiSecond) &&
      second.price > first.price &&
      rsiSecond < rsiFirst - 2
    ) {
      return "bearish";
    }
  }

  return null;
}

function scoreTrendPullback(input: StrategyInput): StrategyCandidate {
  const { currentPrice, trend, indicators } = input;
  const { ema50, support, resistance, atr, rsi } = indicators;

  const trendClear = trend === "bullish" || trend === "bearish";
  const nearEma50 = Math.abs(currentPrice - ema50) / currentPrice < 0.025;
  const inLongPullback =
    currentPrice >= support && currentPrice <= support + atr * 1.5;
  const inShortPullback =
    currentPrice <= resistance && currentPrice >= resistance - atr * 1.5;
  const rsiNeutral = rsi >= 35 && rsi <= 65;

  const checklist: StrategyChecklistItem[] = [
    {
      label: "Aniq trend",
      passed: trendClear,
      detail: trendClear ? `${trend} trend` : "Trend noaniq",
    },
    {
      label: "Pullback zonasi",
      passed:
        trend === "bullish"
          ? inLongPullback || nearEma50
          : trend === "bearish"
            ? inShortPullback || nearEma50
            : false,
      detail: "Support/EMA50 yaqinida qaytish",
    },
    {
      label: "RSI balansda",
      passed: rsiNeutral,
      detail: `RSI ${rsi.toFixed(0)}`,
    },
  ];

  const passed = checklist.filter((item) => item.passed).length;
  const score = Math.round(
    (passed / checklist.length) * 70 + (trendClear ? 20 : 0),
  );

  return { type: "trend_pullback", score, checklist };
}

function scoreEmaCrossover(
  input: StrategyInput,
  ema50: number[],
  ema200: number[],
): StrategyCandidate {
  const cross = findRecentEmaCross(ema50, ema200);
  const { currentPrice, indicators, trend } = input;
  const nearEma50 =
    Math.abs(currentPrice - indicators.ema50) / currentPrice < 0.03;
  const aligned =
    (cross === "bullish" && trend !== "bearish") ||
    (cross === "bearish" && trend !== "bullish");

  const checklist: StrategyChecklistItem[] = [
    {
      label: "EMA kesishma",
      passed: cross !== null,
      detail: cross
        ? cross === "bullish"
          ? "Golden cross (so'nggi 12 sham)"
          : "Death cross (so'nggi 12 sham)"
        : "Kesishma topilmadi",
    },
    {
      label: "Trend mos",
      passed: aligned,
      detail: aligned ? "Kesishma trend bilan mos" : "Trend zid",
    },
    {
      label: "EMA50 pullback",
      passed: nearEma50,
      detail: nearEma50 ? "Narx EMA50 yaqinida" : "Pullback kutilyapti",
    },
  ];

  const passed = checklist.filter((item) => item.passed).length;
  const score =
    cross !== null
      ? Math.round((passed / checklist.length) * 80 + 15)
      : Math.round((passed / checklist.length) * 30);

  return { type: "ema_crossover", score, checklist };
}

function scoreBreakoutRetest(input: StrategyInput): StrategyCandidate {
  const { candles, currentPrice, indicators } = input;
  const direction = detectBreakoutDirection(
    candles,
    indicators.support,
    indicators.resistance,
    indicators.atr,
    currentPrice,
  );
  const volumeOk = indicators.volumeStatus !== "low";

  const checklist: StrategyChecklistItem[] = [
    {
      label: "Breakout bo'lgan",
      passed: direction !== null,
      detail: direction
        ? direction === "long"
          ? "Resistance yuqoriga buzilgan"
          : "Support pastga buzilgan"
        : "Breakout yo'q",
    },
    {
      label: "Retest zonasi",
      passed: direction !== null,
      detail: direction
        ? "Narx eski darajani retest qilmoqda"
        : "Retest zonasida emas",
    },
    {
      label: "Volume qo'llab-quvvatlaydi",
      passed: volumeOk,
      detail: `Volume: ${indicators.volumeStatus}`,
    },
  ];

  const passed = checklist.filter((item) => item.passed).length;
  const score =
    direction !== null
      ? Math.round((passed / checklist.length) * 85 + 10)
      : Math.round((passed / checklist.length) * 25);

  return { type: "breakout_retest", score, checklist };
}

function scoreRsiDivergence(
  input: StrategyInput,
  closes: number[],
): StrategyCandidate {
  const divergence = detectDivergence(input.candles, closes);
  const { indicators, trend } = input;
  const rsiRecovering =
    divergence === "bullish"
      ? indicators.rsi >= 38 && indicators.rsi <= 58
      : divergence === "bearish"
        ? indicators.rsi >= 42 && indicators.rsi <= 62
        : false;

  const checklist: StrategyChecklistItem[] = [
    {
      label: "Divergensiya",
      passed: divergence !== null,
      detail: divergence
        ? divergence === "bullish"
          ? "Bullish divergensiya (pastki low + yuqori RSI)"
          : "Bearish divergensiya (yuqori high + past RSI)"
        : "Divergensiya yo'q",
    },
    {
      label: "RSI tiklanmoqda",
      passed: rsiRecovering,
      detail: `RSI ${indicators.rsi.toFixed(0)}`,
    },
    {
      label: "Trend bloklamaydi",
      passed:
        divergence === "bullish"
          ? trend !== "bearish"
          : divergence === "bearish"
            ? trend !== "bullish"
            : false,
      detail: `${trend} trend`,
    },
  ];

  const passed = checklist.filter((item) => item.passed).length;
  const score =
    divergence !== null
      ? Math.round((passed / checklist.length) * 75 + 5)
      : Math.round((passed / checklist.length) * 20);

  return { type: "rsi_divergence", score, checklist };
}

export function detectStrategy(input: StrategyInput): StrategyDetection {
  const closes = input.candles.map((candle) => candle.close);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);

  const candidates: StrategyCandidate[] = [
    scoreBreakoutRetest(input),
    scoreEmaCrossover(input, ema50, ema200),
    scoreRsiDivergence(input, closes),
    scoreTrendPullback(input),
  ];

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;

  const type =
    best.score >= 45 ? best.type : ("trend_pullback" as StrategyType);
  const selected =
    best.score >= 45
      ? best
      : (candidates.find((item) => item.type === "trend_pullback") ?? best);

  return {
    type,
    label: STRATEGY_LABELS[type],
    description: STRATEGY_DESCRIPTIONS[type],
    confidence: Math.min(100, Math.max(35, selected.score)),
    checklist: selected.checklist,
  };
}

/**
 * Turns the raw detection score into a conviction score that reflects whether
 * acting on the setup right now is sound: it blends pattern quality with trend
 * alignment, candlestick confirmation, live reward:risk, volume support, and
 * RSI extremes.
 */
function finalizeConfidence(
  baseScore: number,
  input: StrategyInput,
  result: VerdictResult,
  pattern: CandlePattern | null,
): number {
  const { trend, indicators } = input;
  const { verdict, side, rrNow } = result;
  let score = baseScore;

  if (verdict === "enter") {
    score += 6;
  } else if (verdict === "avoid") {
    score -= 20;
  }

  if (side !== null) {
    if (patternMatchesSide(pattern, side)) {
      score += pattern?.volumeConfirmed ? 10 : 6;
    } else if (verdict === "enter") {
      // Entry without a confirming candle is allowed but weaker.
      score -= 6;
    }
  }

  if (side !== null) {
    if (rrNow >= 2.5) {
      score += 10;
    } else if (rrNow >= 1.8) {
      score += 6;
    } else if (rrNow >= 1.5) {
      score += 3;
    } else if (rrNow > 0 && rrNow < 1) {
      score -= 10;
    }
  }

  if (side === "long") {
    score += trend === "bullish" ? 8 : trend === "bearish" ? -12 : 0;
  } else if (side === "short") {
    score += trend === "bearish" ? 8 : trend === "bullish" ? -12 : 0;
  }

  if (indicators.volumeStatus === "high") {
    score += 5;
  } else if (indicators.volumeStatus === "low") {
    score -= 6;
  }

  if (side === "long" && indicators.rsi > 75) {
    score -= 8;
  }

  if (side === "short" && indicators.rsi < 25) {
    score -= 8;
  }

  return Math.round(Math.min(99, Math.max(10, score)));
}

function buildTrendPullbackVerdict(
  input: StrategyInput,
  strategy: StrategyDetection,
): VerdictResult {
  const { currentPrice, trend, indicators, marketType } = input;

  if (marketType === "spot" || trend === "bullish" || trend === "neutral") {
    const rawZone = computeLongEntryZone(indicators.support, indicators.atr);
    const idealEntry = (rawZone[0] + rawZone[1]) / 2;
    const invalidation = indicators.support - indicators.atr * 0.5;
    const levels = buildLongLevels(currentPrice, idealEntry, invalidation);
    const entryZone = clampEntryZoneToMinRr(
      rawZone,
      levels,
      "long",
      minRrFor(marketType),
    );
    const [entryLow, entryHigh] = entryZone;
    const inEntryZone = currentPrice >= entryLow && currentPrice <= entryHigh;
    const nearEma50 =
      Math.abs(currentPrice - indicators.ema50) / currentPrice < 0.025;
    const nearResistance =
      (indicators.resistance - currentPrice) / currentPrice < 0.03;
    const rsiHigh = indicators.rsi > 70;
    const belowSupport = currentPrice < indicators.support;

    if (
      marketType === "spot" &&
      (trend === "bearish" || belowSupport || currentPrice < invalidation)
    ) {
      return {
        verdict: "avoid",
        verdictLabel: "KIRISH XATO",
        side: null,
        headline: "Spot long tavsiya etilmaydi",
        reason:
          trend === "bearish"
            ? "Trend bearish — spot faqat long"
            : "Support ostida — long xavfli",
        ...levels,
        entryZone,
        invalidation,
        strategy,
      };
    }

    if (
      (inEntryZone || nearEma50) &&
      levels.rrNow >= minRrFor(marketType) &&
      trend === "bullish" &&
      !rsiHigh &&
      !nearResistance
    ) {
      return {
        verdict: "enter",
        verdictLabel: "LONG",
        side: "long",
        headline: "Trend pullback — long kirish",
        reason: `Support/EMA50 pullback, R:R 1:${levels.rrNow.toFixed(1)}`,
        ...levels,
        entryZone,
        invalidation,
        strategy,
      };
    }

    return {
      verdict: "wait",
      verdictLabel: "KUTING",
      side: null,
      headline: "Trend pullback — kuting",
      reason: rsiHigh
        ? `RSI ${indicators.rsi.toFixed(0)} yuqori — pullback kuting`
        : "Support/EMA50 pullback zonasini kuting",
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  const rawZone = computeShortEntryZone(indicators.resistance, indicators.atr);
  const idealEntry = (rawZone[0] + rawZone[1]) / 2;
  const invalidation = indicators.resistance + indicators.atr * 0.5;
  const levels = buildShortLevels(currentPrice, idealEntry, invalidation);
  const entryZone = clampEntryZoneToMinRr(
    rawZone,
    levels,
    "short",
    minRrFor(marketType),
  );
  const [entryLow, entryHigh] = entryZone;
  const inEntryZone = currentPrice >= entryLow && currentPrice <= entryHigh;
  const nearEma50 =
    Math.abs(currentPrice - indicators.ema50) / currentPrice < 0.025;
  const nearSupport = (currentPrice - indicators.support) / currentPrice < 0.03;
  const rsiLow = indicators.rsi < 30;

  if (currentPrice > invalidation) {
    return {
      verdict: "avoid",
      verdictLabel: "KIRISH XATO",
      side: null,
      headline: "Trend pullback short — bekor",
      reason: "Invalidation ustida — short bekor",
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  if (
    (inEntryZone || nearEma50) &&
    levels.rrNow >= minRrFor(marketType) &&
    !rsiLow &&
    !nearSupport
  ) {
    return {
      verdict: "enter",
      verdictLabel: "SHORT",
      side: "short",
      headline: "Trend pullback — short kirish",
      reason: `Resistance/EMA50 pullback, R:R 1:${levels.rrNow.toFixed(1)}`,
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  return {
    verdict: "wait",
    verdictLabel: "KUTING",
    side: null,
    headline: "Trend pullback short — kuting",
    reason: "Resistance pullback zonasini kuting",
    ...levels,
    entryZone,
    invalidation,
    strategy,
  };
}

function buildBreakoutRetestVerdict(
  input: StrategyInput,
  strategy: StrategyDetection,
): VerdictResult {
  const { candles, currentPrice, indicators, marketType } = input;
  const direction = detectBreakoutDirection(
    candles,
    indicators.support,
    indicators.resistance,
    indicators.atr,
    currentPrice,
  );

  if (direction === "short" && marketType === "spot") {
    return buildTrendPullbackVerdict(input, strategy);
  }

  if (direction === "long" || (direction === null && marketType === "spot")) {
    const rawZone: [number, number] = [
      indicators.resistance - indicators.atr * 0.5,
      indicators.resistance + indicators.atr * 0.3,
    ];
    const invalidation = indicators.resistance - indicators.atr * 1.2;
    const idealEntry = (rawZone[0] + rawZone[1]) / 2;
    const levels = buildLongLevels(currentPrice, idealEntry, invalidation);
    const entryZone = clampEntryZoneToMinRr(
      rawZone,
      levels,
      "long",
      minRrFor(marketType),
    );
    const inRetest =
      currentPrice >= entryZone[0] && currentPrice <= entryZone[1];
    const volumeOk = indicators.volumeStatus !== "low";

    if (currentPrice < invalidation) {
      return {
        verdict: "avoid",
        verdictLabel: "KIRISH XATO",
        side: null,
        headline: "Breakout retest — bekor",
        reason: "Retest muvaffaqiyatsiz — support ostida",
        ...levels,
        entryZone,
        invalidation,
        strategy,
      };
    }

    if (inRetest && levels.rrNow >= minRrFor(marketType) && volumeOk) {
      return {
        verdict: "enter",
        verdictLabel: "LONG",
        side: "long",
        headline: "Breakout + retest — long",
        reason: `Resistance retest, R:R 1:${levels.rrNow.toFixed(1)}`,
        ...levels,
        entryZone,
        invalidation,
        strategy,
      };
    }

    return {
      verdict: "wait",
      verdictLabel: "KUTING",
      side: null,
      headline: "Breakout retest — kuting",
      reason: inRetest
        ? "Volume past — tasdiq kuting"
        : "Retest zonasiga qaytishni kuting",
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  const rawZone: [number, number] = [
    indicators.support - indicators.atr * 0.3,
    indicators.support + indicators.atr * 0.5,
  ];
  const invalidation = indicators.support + indicators.atr * 1.2;
  const idealEntry = (rawZone[0] + rawZone[1]) / 2;
  const levels = buildShortLevels(currentPrice, idealEntry, invalidation);
  const entryZone = clampEntryZoneToMinRr(
    rawZone,
    levels,
    "short",
    minRrFor(marketType),
  );
  const inRetest = currentPrice >= entryZone[0] && currentPrice <= entryZone[1];

  if (currentPrice > invalidation) {
    return {
      verdict: "avoid",
      verdictLabel: "KIRISH XATO",
      side: null,
      headline: "Breakout retest short — bekor",
      reason: "Retest muvaffaqiyatsiz",
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  if (inRetest && levels.rrNow >= minRrFor(marketType)) {
    return {
      verdict: "enter",
      verdictLabel: "SHORT",
      side: "short",
      headline: "Breakout + retest — short",
      reason: `Support retest, R:R 1:${levels.rrNow.toFixed(1)}`,
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  return {
    verdict: "wait",
    verdictLabel: "KUTING",
    side: null,
    headline: "Breakout retest short — kuting",
    reason: "Support retest zonasini kuting",
    ...levels,
    entryZone,
    invalidation,
    strategy,
  };
}

function buildEmaCrossoverVerdict(
  input: StrategyInput,
  strategy: StrategyDetection,
): VerdictResult {
  const closes = input.candles.map((candle) => candle.close);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const cross = findRecentEmaCross(ema50, ema200);
  const { currentPrice, indicators, marketType } = input;

  if (cross === "bearish" && marketType === "futures") {
    const rawZone: [number, number] = [
      indicators.ema50 - indicators.atr * 0.3,
      indicators.ema50 + indicators.atr * 0.2,
    ];
    const invalidation = indicators.ema50 + indicators.atr * 1.5;
    const idealEntry = (rawZone[0] + rawZone[1]) / 2;
    const levels = buildShortLevels(currentPrice, idealEntry, invalidation);
    const entryZone = clampEntryZoneToMinRr(
      rawZone,
      levels,
      "short",
      minRrFor(marketType),
    );
    const inPullback =
      currentPrice >= entryZone[0] && currentPrice <= entryZone[1];
    const belowEmas =
      currentPrice < indicators.ema50 && currentPrice < indicators.ema200;

    if (currentPrice > invalidation) {
      return {
        verdict: "avoid",
        verdictLabel: "KIRISH XATO",
        side: null,
        headline: "EMA crossover short — bekor",
        reason: "Death cross — invalidation buzilgan",
        ...levels,
        entryZone,
        invalidation,
        strategy,
      };
    }

    if (inPullback && belowEmas && levels.rrNow >= minRrFor(marketType)) {
      return {
        verdict: "enter",
        verdictLabel: "SHORT",
        side: "short",
        headline: "EMA crossover — short",
        reason: `Death cross pullback, R:R 1:${levels.rrNow.toFixed(1)}`,
        ...levels,
        entryZone,
        invalidation,
        strategy,
      };
    }

    return {
      verdict: "wait",
      verdictLabel: "KUTING",
      side: null,
      headline: "EMA crossover short — kuting",
      reason: "EMA50 ga pullback kuting",
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  const rawZone: [number, number] = [
    indicators.ema50 - indicators.atr * 0.2,
    indicators.ema50 + indicators.atr * 0.3,
  ];
  const invalidation = indicators.ema50 - indicators.atr * 1.5;
  const idealEntry = (rawZone[0] + rawZone[1]) / 2;
  const levels = buildLongLevels(currentPrice, idealEntry, invalidation);
  const entryZone = clampEntryZoneToMinRr(
    rawZone,
    levels,
    "long",
    minRrFor(marketType),
  );
  const inPullback =
    currentPrice >= entryZone[0] && currentPrice <= entryZone[1];
  const aboveEmas =
    currentPrice > indicators.ema50 && currentPrice > indicators.ema200;

  if (marketType === "spot" && input.trend === "bearish") {
    return buildTrendPullbackVerdict(input, strategy);
  }

  // Only a confirmed golden cross can be invalidated; without a cross there is
  // no thesis to void, so the setup stays in "wait".
  if (cross === "bullish" && currentPrice < invalidation) {
    return {
      verdict: "avoid",
      verdictLabel: "KIRISH XATO",
      side: null,
      headline: "EMA crossover — bekor",
      reason: "Golden cross — invalidation buzilgan",
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  if (
    cross === "bullish" &&
    inPullback &&
    aboveEmas &&
    levels.rrNow >= minRrFor(marketType)
  ) {
    return {
      verdict: "enter",
      verdictLabel: "LONG",
      side: "long",
      headline: "EMA crossover — long",
      reason: `Golden cross pullback, R:R 1:${levels.rrNow.toFixed(1)}`,
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  return {
    verdict: "wait",
    verdictLabel: "KUTING",
    side: null,
    headline: "EMA crossover — kuting",
    reason: cross
      ? "EMA50 pullback zonasini kuting"
      : "EMA kesishma hali shakllanmagan",
    ...levels,
    entryZone,
    invalidation,
    strategy,
  };
}

function buildRsiDivergenceVerdict(
  input: StrategyInput,
  strategy: StrategyDetection,
): VerdictResult {
  const closes = input.candles.map((candle) => candle.close);
  const divergence = detectDivergence(input.candles, closes);
  const { currentPrice, indicators, marketType } = input;

  if (divergence === "bearish" && marketType === "futures") {
    const rawZone = computeShortEntryZone(
      indicators.resistance,
      indicators.atr,
    );
    const invalidation = indicators.resistance + indicators.atr * 0.75;
    const idealEntry = (rawZone[0] + rawZone[1]) / 2;
    const levels = buildShortLevels(currentPrice, idealEntry, invalidation);
    const entryZone = clampEntryZoneToMinRr(
      rawZone,
      levels,
      "short",
      minRrDivergence(marketType),
    );
    const inZone = currentPrice >= entryZone[0] && currentPrice <= entryZone[1];

    if (currentPrice > invalidation) {
      return {
        verdict: "avoid",
        verdictLabel: "KIRISH XATO",
        side: null,
        headline: "RSI divergensiya short — bekor",
        reason: "Bearish divergensiya — signal kuchsiz",
        ...levels,
        entryZone,
        invalidation,
        strategy,
      };
    }

    if (inZone && levels.rrNow >= minRrDivergence(marketType)) {
      return {
        verdict: "enter",
        verdictLabel: "SHORT",
        side: "short",
        headline: "RSI divergensiya — short",
        reason: `Bearish divergensiya, R:R 1:${levels.rrNow.toFixed(1)}`,
        ...levels,
        entryZone,
        invalidation,
        strategy,
      };
    }

    return {
      verdict: "wait",
      verdictLabel: "KUTING",
      side: null,
      headline: "RSI divergensiya short — kuting",
      reason: "Divergensiya tasdiqlanishi kerak",
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  const rawZone = computeLongEntryZone(indicators.support, indicators.atr);
  const invalidation = indicators.support - indicators.atr * 0.75;
  const idealEntry = (rawZone[0] + rawZone[1]) / 2;
  const levels = buildLongLevels(currentPrice, idealEntry, invalidation);
  const entryZone = clampEntryZoneToMinRr(
    rawZone,
    levels,
    "long",
    minRrDivergence(marketType),
  );
  const inZone = currentPrice >= entryZone[0] && currentPrice <= entryZone[1];

  if (marketType === "spot" && input.trend === "bearish") {
    return buildTrendPullbackVerdict(input, strategy);
  }

  if (currentPrice < invalidation) {
    return {
      verdict: "avoid",
      verdictLabel: "KIRISH XATO",
      side: null,
      headline: "RSI divergensiya — bekor",
      reason: "Bullish divergensiya — signal kuchsiz",
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  if (
    divergence === "bullish" &&
    inZone &&
    levels.rrNow >= minRrDivergence(marketType)
  ) {
    return {
      verdict: "enter",
      verdictLabel: "LONG",
      side: "long",
      headline: "RSI divergensiya — long",
      reason: `Bullish divergensiya, R:R 1:${levels.rrNow.toFixed(1)}`,
      ...levels,
      entryZone,
      invalidation,
      strategy,
    };
  }

  return {
    verdict: "wait",
    verdictLabel: "KUTING",
    side: null,
    headline: "RSI divergensiya — kuting",
    reason: divergence
      ? "Support zonasida tasdiq kuting"
      : "Divergensiya shakllanmagan",
    ...levels,
    entryZone,
    invalidation,
    strategy,
  };
}

export function buildStrategyVerdict(input: StrategyInput): VerdictResult {
  const strategy = detectStrategy(input);
  const pattern = detectCandlePattern(input.candles);

  let result: VerdictResult;

  switch (strategy.type) {
    case "breakout_retest":
      result = buildBreakoutRetestVerdict(input, strategy);
      break;
    case "ema_crossover":
      result = buildEmaCrossoverVerdict(input, strategy);
      break;
    case "rsi_divergence":
      result = buildRsiDivergenceVerdict(input, strategy);
      break;
    default:
      result = buildTrendPullbackVerdict(input, strategy);
      break;
  }

  result.pattern = pattern;

  const patternItem: StrategyChecklistItem = {
    label: "Sham tasdiqlash",
    passed: patternMatchesSide(pattern, result.side),
    detail: pattern
      ? `${pattern.label}${pattern.volumeConfirmed ? " · volume tasdiqladi" : ""}`
      : "Tasdiqlovchi sham formatsiyasi yo'q",
  };

  const confidence = finalizeConfidence(
    strategy.confidence,
    input,
    result,
    pattern,
  );
  result.strategy = {
    ...result.strategy,
    confidence,
    checklist: [...result.strategy.checklist, patternItem],
  };

  return result;
}

export function verdictRank(verdict: Verdict): number {
  switch (verdict) {
    case "enter":
      return 3;
    case "wait":
      return 2;
    default:
      return 1;
  }
}
