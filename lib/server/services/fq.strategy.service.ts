import { getKlines } from "./binance.service";
import {
  FQ_15M_CONFIG,
  FQ_4H_CONFIG,
  FQ_SWING_CONFIG,
  computeFqLevels,
  computeFqSeries,
  computeHtfBias,
  evaluateFqBar,
  type FqBarState,
  type FqConfig,
  type FqHtfBias,
  type FqSetup,
} from "./fq-strategy/engine";
import type {
  Candle,
  FqAnalysisResponse,
  MarketType,
  StrategyChecklistItem,
  TradeSide,
} from "../types/index";

const VERDICT_LABELS: Record<FqAnalysisResponse["verdict"], string> = {
  enter: "Kirish",
  wait: "Kutish",
  avoid: "Kirmaslik",
};

export type FqStrategyId = FqAnalysisResponse["strategyId"];

/** Bir xil FQ dvigateli, turli timeframe va filtrlar — har biri alohida strategiya. */
export interface FqProfile {
  id: FqStrategyId;
  interval: string;
  htfInterval: string;
  intervalMs: number;
  config: FqConfig;
  /** Telegram va UI uchun qisqa nom. */
  label: string;
  /** Faqat shu coinlar skanerlanadi (backtest qilinganlari); null — hajm bo'yicha top. */
  symbols: readonly string[] | null;
}

export const FQ_PROFILES: Record<FqStrategyId, FqProfile> = {
  fq_15m: {
    id: "fq_15m",
    interval: "15m",
    htfInterval: "4h",
    intervalMs: 15 * 60_000,
    config: FQ_15M_CONFIG,
    label: "Day 15M · FQ v3",
    symbols: null,
  },
  fq_v3: {
    id: "fq_v3",
    interval: "1h",
    htfInterval: "4h",
    intervalMs: 3_600_000,
    config: FQ_SWING_CONFIG,
    label: "Swing 1H · FQ v3",
    symbols: null,
  },
  fq_4h: {
    id: "fq_4h",
    interval: "4h",
    htfInterval: "1d",
    intervalMs: 4 * 3_600_000,
    config: FQ_4H_CONFIG,
    label: "Swing 4H · FQ v3 + Fib",
    symbols: [
      "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT",
      "LINKUSDT", "AVAXUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "NEARUSDT", "UNIUSDT",
      "AAVEUSDT", "ATOMUSDT", "FILUSDT", "ETCUSDT", "SUIUSDT", "TRXUSDT",
    ],
  },
};

export const FQ_INTERVAL = FQ_PROFILES.fq_v3.interval;
const ANALYSIS_LIMIT = 500;
const HTF_EMA_LEN = 200;
/** Pine'dagi cooldown (3 sham) — shu oraliqdagi signal hali "yangi" hisoblanadi. */
const RECENT_SIGNAL_BARS = 3;

function closedCandles(candles: Candle[]): Candle[] {
  const last = candles.at(-1);
  if (last && last.closeTime > Date.now()) return candles.slice(0, -1);
  return candles;
}

function trendOf(state: FqBarState | null): FqAnalysisResponse["trend"] {
  if (!state) return "neutral";
  if (state.upTrend) return "up";
  if (state.dnTrend) return "down";
  return "neutral";
}

function preferredSide(
  state: FqBarState | null,
  htfBias: FqHtfBias,
  marketType: MarketType,
): TradeSide {
  if (!state) return null;
  let side: TradeSide = null;
  if (state.upTrend) side = "long";
  else if (state.dnTrend) side = "short";
  else if (htfBias === "bullish") side = "long";
  else if (htfBias === "bearish") side = "short";
  else side = state.close >= state.emaSlow ? "long" : "short";

  if (side === "short" && marketType !== "futures") return null;
  return side;
}

function setupOf(state: FqBarState, side: TradeSide): Exclude<FqSetup, "sweep"> | null {
  if (side === "long") {
    if (state.boLong) return "breakout";
    if (state.pbLong) return "pullback";
  }
  if (side === "short") {
    if (state.boShort) return "breakout";
    if (state.pbShort) return "pullback";
  }
  return null;
}

function hasSignal(state: FqBarState | null, side: TradeSide): boolean {
  if (!state || !side) return false;
  return side === "long" ? state.longSig : state.shortSig;
}

function buildChecklist(params: {
  state: FqBarState;
  side: "long" | "short";
  htfBias: FqHtfBias;
  trigger: FqSetup | null;
  riskOk: boolean;
  config: FqConfig;
  htfInterval: string;
}): StrategyChecklistItem[] {
  const { state, side, htfBias, trigger, riskOk, config, htfInterval } = params;
  const long = side === "long";
  const emaAligned = long
    ? state.close > state.emaSlow && state.emaMid > state.emaSlow
    : state.close < state.emaSlow && state.emaMid < state.emaSlow;
  const htfOk = long ? htfBias === "bullish" : htfBias === "bearish";
  const diOk = long ? state.diLongOk : state.diShortOk;

  return [
    {
      label: "EMA trend (50 / 200)",
      passed: emaAligned,
      detail: emaAligned
        ? long
          ? "Narx va EMA 50 — EMA 200 dan yuqori"
          : "Narx va EMA 50 — EMA 200 dan past"
        : "EMA tartibi trendni tasdiqlamaydi",
    },
    {
      label: `Katta TF (${htfInterval.toUpperCase()}) EMA ${HTF_EMA_LEN}`,
      passed: htfOk,
      detail: htfOk
        ? "Katta timeframe bir xil yo'nalishda"
        : htfBias
          ? "Katta timeframe qarama-qarshi"
          : "Katta TF ma'lumoti yetarli emas",
    },
    {
      label: `ADX ≥ ${config.adxMin}`,
      passed: state.adxOk,
      detail: `ADX = ${state.adx.toFixed(1)}${state.adxOk ? "" : " — trend kuchsiz"}`,
    },
    {
      label: "DI yo'nalishi",
      passed: diOk,
      detail: `+DI ${state.diPlus.toFixed(1)} / −DI ${state.diMinus.toFixed(1)}`,
    },
    {
      label: `Cho'zilish ≤ ${config.extMaxAtr} ATR`,
      passed: state.extOk,
      detail: `EMA 20 dan ${(Math.abs(state.close - state.emaFast) / state.atr).toFixed(2)} ATR uzoqda`,
    },
    {
      label: "Pullback yoki Breakout",
      passed: trigger !== null,
      detail:
        trigger === "breakout"
          ? `${config.brkLen} shamlik diapazon hajm bilan sindi`
          : trigger === "pullback"
            ? "Narx EMA 20 ga qaytib, tasdiqlovchi sham yopdi"
            : "Trigger sham hali yo'q",
    },
    ...(config.useFibZone
      ? [
          {
            label: `Fib ${config.fibMin ?? 0.5}–${config.fibMax ?? 0.786} zona`,
            passed:
              trigger !== "pullback" ||
              ((long ? state.fibLong : state.fibShort) >= (config.fibMin ?? 0.5) &&
                (long ? state.fibLong : state.fibShort) <= (config.fibMax ?? 0.786)),
            detail: Number.isFinite(long ? state.fibLong : state.fibShort)
              ? `Pullback impulsning ${(long ? state.fibLong : state.fibShort).toFixed(2)} darajasida`
              : "Impuls aniqlanmadi",
          },
        ]
      : []),
    {
      label: `Stop ≤ ${config.maxRiskAtr} ATR`,
      passed: riskOk,
      detail: riskOk ? "Stop masofasi me'yorda" : "Stop juda uzoq — savdo o'tkaziladi",
    },
  ];
}

const WEIGHTS = [20, 15, 15, 10, 10, 20, 10];

function computeScore(checklist: StrategyChecklistItem[]): number {
  return checklist.reduce(
    (total, item, index) => total + (item.passed ? (WEIGHTS[index] ?? 0) : 0),
    0,
  );
}

export function buildFqFromCandles(
  symbol: string,
  marketType: MarketType,
  candles: Candle[],
  htfCandles: Candle[],
  config: FqConfig = FQ_SWING_CONFIG,
  profile: FqProfile = FQ_PROFILES.fq_v3,
): FqAnalysisResponse {
  const htfBias = computeHtfBias(htfCandles, HTF_EMA_LEN);
  const series = computeFqSeries(candles, config);
  const lastIndex = candles.length - 1;
  const state = evaluateFqBar(series, lastIndex, htfBias, config);
  const side = preferredSide(state, htfBias, marketType);
  const currentPrice = candles.at(-1)?.close ?? 0;

  const base = {
    strategyId: profile.id,
    symbol: symbol.toUpperCase(),
    marketType,
    currentPrice,
    timeframe: profile.interval,
    htfTimeframe: profile.htfInterval,
    htfBias,
    riskPercent: config.riskPct,
    candleTime: candles.at(-1)?.openTime ?? null,
    generatedAt: new Date().toISOString(),
  };

  if (!state || !side) {
    return {
      ...base,
      side: null,
      verdict: "avoid",
      verdictLabel: VERDICT_LABELS.avoid,
      score: 0,
      reason: state
        ? "Spot bozorda short savdo yo'q — trend pastga"
        : "Indikatorlar uchun ma'lumot yetarli emas",
      trend: trendOf(state),
      setup: null,
      signalBarsAgo: null,
      signalTime: null,
      indicators: {
        emaFast: state?.emaFast ?? 0,
        emaMid: state?.emaMid ?? 0,
        emaSlow: state?.emaSlow ?? 0,
        rsi: state?.rsi ?? 0,
        adx: state?.adx ?? 0,
        diPlus: state?.diPlus ?? 0,
        diMinus: state?.diMinus ?? 0,
        atr: state?.atr ?? 0,
      },
      entry: 0,
      stopLoss: 0,
      tp1: 0,
      tp2: 0,
      takeProfit: 0,
      riskReward: 0,
      confluences: [],
      checklist: [],
    };
  }

  // Oxirgi bir necha shamda signal bo'lganmi (Pine: signal sham yopilishida kirish).
  let signalBarsAgo: number | null = null;
  let signalState: FqBarState | null = null;
  for (let ago = 0; ago <= RECENT_SIGNAL_BARS; ago++) {
    const past = ago === 0 ? state : evaluateFqBar(series, lastIndex - ago, htfBias, config);
    if (hasSignal(past, side)) {
      signalBarsAgo = ago;
      signalState = past;
      break;
    }
  }

  const levelState = signalState ?? state;
  const levels = computeFqLevels(levelState, side, config);
  const trigger = setupOf(levelState, side);

  const checklist = buildChecklist({
    state: levelState,
    side,
    htfBias,
    trigger,
    riskOk: levels.riskOk,
    config,
    htfInterval: profile.htfInterval,
  });
  const score = computeScore(checklist);

  // Signaldan keyin narx stopga yoki TP2 ga yetgan bo'lsa, setup eskirgan.
  const stale =
    signalBarsAgo !== null &&
    signalBarsAgo > 0 &&
    candles.slice(lastIndex - signalBarsAgo + 1).some((c) =>
      side === "long"
        ? c.low <= levels.stopLoss || c.high >= levels.tp2
        : c.high >= levels.stopLoss || c.low <= levels.tp2,
    );

  let verdict: FqAnalysisResponse["verdict"];
  let reason: string;
  const sideLabel = side === "long" ? "LONG" : "SHORT";
  const setupLabel = trigger === "breakout" ? "Breakout" : "Pullback";

  if (signalBarsAgo === 0 && levels.riskOk) {
    verdict = "enter";
    reason = `${sideLabel} ${setupLabel} — oxirgi yopilgan shamda barcha shartlar bajarildi. TP1 da 50% yopish, stopni BE ga surish.`;
  } else if (signalBarsAgo !== null && levels.riskOk && !stale) {
    verdict = "wait";
    reason = `${sideLabel} ${setupLabel} signali ${signalBarsAgo} sham oldin — kirish narxidan uzoqlashmagan bo'lsa ko'rib chiqing`;
  } else if (
    (side === "long" ? state.upTrend : state.dnTrend) &&
    state.adxOk &&
    score >= 50
  ) {
    verdict = "wait";
    reason =
      side === "long"
        ? "Trend yuqoriga — EMA 20 ga pullback yoki diapazon breakoutini kuting"
        : "Trend pastga — EMA 20 ga pullback yoki diapazon breakdownini kuting";
  } else {
    verdict = "avoid";
    reason = !state.upTrend && !state.dnTrend
      ? "Trend aniq emas (EMA / katta TF mos emas) — savdo yo'q"
      : "ADX yoki boshqa filtrlar o'tmadi — kirmang";
  }

  return {
    ...base,
    side,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    score,
    reason,
    trend: trendOf(state),
    setup: signalBarsAgo !== null ? trigger : null,
    signalBarsAgo,
    signalTime:
      signalBarsAgo !== null ? (candles[lastIndex - signalBarsAgo]?.openTime ?? null) : null,
    indicators: {
      emaFast: state.emaFast,
      emaMid: state.emaMid,
      emaSlow: state.emaSlow,
      rsi: state.rsi,
      adx: state.adx,
      diPlus: state.diPlus,
      diMinus: state.diMinus,
      atr: state.atr,
    },
    entry: levels.entry,
    stopLoss: levels.stopLoss,
    tp1: levels.tp1,
    tp2: levels.tp2,
    takeProfit: levels.tp2,
    riskReward: Number(((levels.tp2 - levels.entry) / (levels.entry - levels.stopLoss)).toFixed(2)),
    confluences: side === "long" ? levelState.confluencesLong : levelState.confluencesShort,
    checklist,
  };
}

export async function buildFqAnalysis(
  symbol: string,
  marketType: MarketType = "futures",
  strategy: FqStrategyId = "fq_v3",
): Promise<FqAnalysisResponse> {
  const profile = FQ_PROFILES[strategy];
  const [raw, htfRaw] = await Promise.all([
    getKlines(symbol, profile.interval, ANALYSIS_LIMIT, marketType),
    getKlines(symbol, profile.htfInterval, ANALYSIS_LIMIT, marketType),
  ]);
  return buildFqFromCandles(symbol, marketType, closedCandles(raw), closedCandles(htfRaw), profile.config, profile);
}
