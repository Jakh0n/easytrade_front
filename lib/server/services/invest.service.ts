import { getKlines } from "./binance.service";
import {
  calculateEMA,
  calculateRSI,
  findSwingHighs,
  findSwingLows,
} from "./indicators.service";
import { getBtcTrend } from "./market.service";
import { determineTrend } from "./risk.service";
import type {
  Candle,
  DcaTranche,
  InvestAnalysis,
  InvestHorizon,
  InvestTarget,
  InvestVerdict,
  StrategyChecklistItem,
  Trend,
} from "../types/index";

const DAILY_LIMIT = 400;
const WEEKLY_LIMIT = 200;
const YEAR_DAYS = 365;

// DCA tranche allocation: first buy is the largest, deeper levels smaller.
const TRANCHE_ALLOCATIONS = [40, 30, 30] as const;

// Support zones within this fraction of each other are treated as one level.
const ZONE_MERGE_TOLERANCE = 0.02;

const HORIZON_LABELS: Record<InvestHorizon, string> = {
  "1_3": "1-3 oy",
  "3_6": "3-6 oy",
  "6_12": "6-12 oy",
  "12_24": "12-24 oy",
};

// Longer horizons tolerate deeper drawdowns before the thesis is void and can
// aim for more ambitious targets.
const HORIZON_CONFIG: Record<
  InvestHorizon,
  { invalidationBuffer: number; targetMultipliers: [number, number] }
> = {
  "1_3": { invalidationBuffer: 0.08, targetMultipliers: [1, 1] },
  "3_6": { invalidationBuffer: 0.12, targetMultipliers: [1, 1.2] },
  "6_12": { invalidationBuffer: 0.15, targetMultipliers: [1.2, 1.5] },
  "12_24": { invalidationBuffer: 0.2, targetMultipliers: [1.3, 1.8] },
};

const VERDICT_LABELS: Record<InvestVerdict, string> = {
  accumulate: "JAMG'ARISH",
  dca_wait: "BOSQICHLI KUTISH",
  avoid: "TAVSIYA ETILMAYDI",
};

function lastFinite(values: number[]): number {
  const value = values[values.length - 1];
  return value !== undefined && Number.isFinite(value) ? value : NaN;
}

/**
 * Distinct weekly swing-low levels below the current price, nearest first.
 * Nearby levels (within 2%) are merged so the DCA plan doesn't stack two
 * tranches on what is effectively one support.
 */
export function findSupportZones(
  weeklyCandles: Candle[],
  currentPrice: number,
  maxZones: number = 3,
): number[] {
  const lows = findSwingLows(weeklyCandles)
    .map((swing) => swing.price)
    .filter((price) => price < currentPrice)
    .sort((a, b) => b - a);

  const zones: number[] = [];
  for (const low of lows) {
    const merged = zones.some(
      (zone) => Math.abs(zone - low) / zone < ZONE_MERGE_TOLERANCE,
    );
    if (!merged) {
      zones.push(low);
    }
    if (zones.length >= maxZones) {
      break;
    }
  }

  return zones;
}

interface ScoredChecklist {
  checklist: StrategyChecklistItem[];
  score: number;
}

function buildChecklist(params: {
  trend: Trend;
  weeklyRsi: number;
  drawdownFromHigh: number;
  currentPrice: number;
  low52w: number;
  btcTrend: Trend;
  hasSupports: boolean;
}): ScoredChecklist {
  const {
    trend,
    weeklyRsi,
    drawdownFromHigh,
    currentPrice,
    low52w,
    btcTrend,
    hasSupports,
  } = params;

  const aboveLowBuffer = currentPrice > low52w * 1.05;
  const rsiHealthy = weeklyRsi >= 35 && weeklyRsi <= 65;
  const hasDiscount = drawdownFromHigh >= 10;
  const nearAth = drawdownFromHigh < 5;

  const items: Array<StrategyChecklistItem & { weight: number }> = [
    {
      label: "Makro trend",
      passed: trend !== "bearish",
      detail:
        trend === "bullish"
          ? "Kunlik EMA50 > EMA200 — yuqoriga trend"
          : trend === "neutral"
            ? "Trend neytral — asos shakllanmoqda"
            : "Kunlik trend pastga — pichoq tushishini ushlamang",
      weight: 25,
    },
    {
      label: "Haftalik RSI",
      passed: rsiHealthy,
      detail: `RSI(14) haftalik: ${weeklyRsi.toFixed(0)}${
        weeklyRsi > 65 ? " — qizigan" : weeklyRsi < 35 ? " — haddan sotilgan" : " — sog'lom zona"
      }`,
      weight: 15,
    },
    {
      label: "Narx chegirmasi",
      passed: hasDiscount && !nearAth,
      detail: nearAth
        ? `52 haftalik cho'qqiga ${drawdownFromHigh.toFixed(1)}% — ATH yaqinida xarid xavfli`
        : `52 haftalik cho'qqidan −${drawdownFromHigh.toFixed(1)}%`,
      weight: 20,
    },
    {
      label: "52 haftalik tub ustida",
      passed: aboveLowBuffer,
      detail: aboveLowBuffer
        ? "Narx yillik tubdan uzoqlashgan — struktura buzilmagan"
        : "Narx yillik tubga juda yaqin — trend zaif",
      weight: 15,
    },
    {
      label: "BTC bozor rejimi",
      passed: btcTrend !== "bearish",
      detail: `BTC kunlik trend: ${btcTrend}`,
      weight: 15,
    },
    {
      label: "Support zonalari",
      passed: hasSupports,
      detail: hasSupports
        ? "DCA uchun haftalik support darajalari mavjud"
        : "Aniq support topilmadi — DCA darajalari taxminiy",
      weight: 10,
    },
  ];

  const score = items.reduce(
    (sum, item) => sum + (item.passed ? item.weight : 0),
    0,
  );

  return {
    checklist: items.map(({ label, passed, detail }) => ({
      label,
      passed,
      detail,
    })),
    score,
  };
}

function decideVerdict(
  score: number,
  trend: Trend,
  btcTrend: Trend,
  drawdownFromHigh: number,
): { verdict: InvestVerdict; reason: string } {
  if (trend === "bearish" && btcTrend === "bearish") {
    return {
      verdict: "avoid",
      reason:
        "Coin ham, BTC ham pastga trendda — uzoq muddatli xarid uchun asos yo'q, trend burilishini kuting",
    };
  }

  if (score >= 70) {
    return {
      verdict: "accumulate",
      reason:
        "Makro sharoit qulay — DCA rejasi bo'yicha bosqichli jamg'arishni boshlash mumkin",
    };
  }

  if (score >= 45) {
    return {
      verdict: "dca_wait",
      reason:
        drawdownFromHigh < 5
          ? "Narx cho'qqiga yaqin — birinchi xaridni support zonasiga korreksiyada qiling"
          : "Sharoit aralash — kichik birinchi ulush, qolganini chuqurroq darajalarda oling",
    };
  }

  return {
    verdict: "avoid",
    reason:
      "Ko'rsatkichlarning aksariyati qarshi — kapitalni saqlang, kuchliroq setup kuting",
  };
}

/**
 * DCA plan: the first tranche at (or near) the current price, deeper tranches
 * on weekly supports. When the verdict is dca_wait the first tranche moves to
 * the nearest support instead of market price.
 */
function buildDcaPlan(
  capital: number,
  currentPrice: number,
  supportZones: number[],
  verdict: InvestVerdict,
): DcaTranche[] {
  const fallback1 = currentPrice * 0.93;
  const fallback2 = currentPrice * 0.85;

  const zone1 = supportZones[0] ?? fallback1;
  const zone2 = supportZones[1] ?? Math.min(zone1 * 0.92, fallback2);

  const prices: [number, number, number] =
    verdict === "accumulate"
      ? [currentPrice, zone1, zone2]
      : [zone1, zone2, supportZones[2] ?? zone2 * 0.92];

  const notes: [string, string, string] =
    verdict === "accumulate"
      ? [
          "Birinchi ulush — hozirgi narxda",
          "Ikkinchi ulush — eng yaqin haftalik supportda",
          "Uchinchi ulush — chuqur korreksiyada",
        ]
      : [
          "Birinchi ulush — supportga korreksiyani kuting",
          "Ikkinchi ulush — chuqurroq supportda",
          "Uchinchi ulush — panika tushishida",
        ];

  return prices.map((price, index) => {
    const allocationPercent = TRANCHE_ALLOCATIONS[index]!;
    const amountUsd = (capital * allocationPercent) / 100;
    return {
      label: `${index + 1}-bosqich`,
      price,
      allocationPercent,
      amountUsd,
      units: amountUsd / price,
      note: notes[index]!,
    };
  });
}

function buildTargets(
  weeklyCandles: Candle[],
  currentPrice: number,
  high52w: number,
  horizon: InvestHorizon,
): InvestTarget[] {
  const { targetMultipliers } = HORIZON_CONFIG[horizon];

  const nearestResistance = findSwingHighs(weeklyCandles)
    .map((swing) => swing.price)
    .filter((price) => price > currentPrice)
    .sort((a, b) => a - b)[0];

  const raw: Array<{ label: string; price: number }> = [];

  if (nearestResistance !== undefined && nearestResistance < high52w * 0.98) {
    raw.push({ label: "Yaqin resistance", price: nearestResistance });
  }

  raw.push({
    label: "52 haftalik cho'qqi",
    price: high52w * targetMultipliers[0],
  });

  if (targetMultipliers[1] > targetMultipliers[0]) {
    raw.push({
      label: "Kengaytirilgan maqsad",
      price: high52w * targetMultipliers[1],
    });
  }

  return raw
    .filter((target) => target.price > currentPrice)
    .map((target) => ({
      ...target,
      upsidePercent: ((target.price - currentPrice) / currentPrice) * 100,
    }));
}

export async function buildInvestAnalysis(
  symbol: string,
  capital: number,
  horizon: InvestHorizon,
  options?: { btcTrend?: Trend },
): Promise<InvestAnalysis> {
  const normalizedSymbol = symbol.toUpperCase();

  const [dailyCandles, weeklyCandles, btcTrend] = await Promise.all([
    getKlines(normalizedSymbol, "1d", DAILY_LIMIT, "spot"),
    getKlines(normalizedSymbol, "1w", WEEKLY_LIMIT, "spot"),
    options?.btcTrend !== undefined
      ? Promise.resolve(options.btcTrend)
      : getBtcTrend("1d", "spot").then((regime) => regime.trend),
  ]);

  const dailyCloses = dailyCandles.map((candle) => candle.close);
  const weeklyCloses = weeklyCandles.map((candle) => candle.close);
  const currentPrice = dailyCloses[dailyCloses.length - 1];

  if (currentPrice === undefined) {
    throw new Error("Narx ma'lumotlari topilmadi");
  }

  const ema50 = lastFinite(calculateEMA(dailyCloses, 50));
  const ema200 = lastFinite(calculateEMA(dailyCloses, 200));
  const trend = determineTrend(ema50, ema200, currentPrice);

  const weeklyRsi =
    weeklyCloses.length >= 15 ? calculateRSI(weeklyCloses, 14) : 50;

  const yearCandles = dailyCandles.slice(-YEAR_DAYS);
  const high52w = Math.max(...yearCandles.map((candle) => candle.high));
  const low52w = Math.min(...yearCandles.map((candle) => candle.low));
  const drawdownFromHigh = ((high52w - currentPrice) / high52w) * 100;

  const supportZones = findSupportZones(weeklyCandles, currentPrice);

  const { checklist, score } = buildChecklist({
    trend,
    weeklyRsi,
    drawdownFromHigh,
    currentPrice,
    low52w,
    btcTrend,
    hasSupports: supportZones.length > 0,
  });

  const { verdict, reason } = decideVerdict(
    score,
    trend,
    btcTrend,
    drawdownFromHigh,
  );

  const dcaPlan = buildDcaPlan(capital, currentPrice, supportZones, verdict);

  const totalUnits = dcaPlan.reduce((sum, tranche) => sum + tranche.units, 0);
  const totalSpent = dcaPlan.reduce(
    (sum, tranche) => sum + tranche.amountUsd,
    0,
  );
  const averageEntry = totalUnits > 0 ? totalSpent / totalUnits : currentPrice;

  const { invalidationBuffer } = HORIZON_CONFIG[horizon];
  const lowestTranche = Math.min(...dcaPlan.map((tranche) => tranche.price));
  const invalidation = Math.max(
    lowestTranche * (1 - invalidationBuffer),
    low52w * 0.95,
  );
  const maxLossPercent = ((averageEntry - invalidation) / averageEntry) * 100;

  return {
    symbol: normalizedSymbol,
    horizon,
    horizonLabel: HORIZON_LABELS[horizon],
    currentPrice,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    score,
    reason,
    trend,
    weeklyRsi,
    high52w,
    low52w,
    drawdownFromHigh,
    supportZones,
    targets: buildTargets(weeklyCandles, currentPrice, high52w, horizon),
    invalidation,
    maxLossPercent,
    averageEntry,
    dcaPlan,
    checklist,
    btcTrend,
    generatedAt: new Date().toISOString(),
  };
}
