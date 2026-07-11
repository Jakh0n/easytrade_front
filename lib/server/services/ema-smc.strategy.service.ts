import { getKlines } from "./binance.service";
import { calculateEMA } from "./indicators.service";
import { buildSmcSetup } from "./smc.service";
import type {
  MarketType,
  StrategyChecklistItem,
  TradeSide,
} from "../types/index";

export type EmaSmcVerdict = "enter" | "wait" | "avoid";

export interface EmaSmcAnalysis {
  symbol: string;
  marketType: MarketType;
  currentPrice: number;
  side: TradeSide;
  verdict: EmaSmcVerdict;
  verdictLabel: string;
  score: number;
  reason: string;
  ema200: number;
  trendDirection: "bullish" | "bearish";
  keyLevels: {
    pdh: number;
    pdl: number;
    eqh: number | null;
    eql: number | null;
  };
  sweep: {
    level: number;
    levelType: string;
  } | null;
  structure: {
    type: "bos" | "choch";
    level: number;
  } | null;
  entryType: "fvg" | "ob" | null;
  entryZone: [number, number] | null;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  checklist: StrategyChecklistItem[];
  generatedAt: string;
}

const VERDICT_LABELS: Record<EmaSmcVerdict, string> = {
  enter: "Kirish",
  wait: "Kutish",
  avoid: "Kirmaslik",
};

function buildChecklist(
  priceAboveEma: boolean,
  side: TradeSide,
  sweep: boolean,
  structure: boolean,
  entry: boolean,
  rr: number,
): StrategyChecklistItem[] {
  return [
    {
      label: "EMA 200 trend",
      passed: side !== null,
      detail:
        side === "long"
          ? "Narx EMA 200 dan yuqori — faqat BUY"
          : side === "short"
            ? "Narx EMA 200 dan past — faqat SELL"
            : "Trend noaniq",
    },
    {
      label: "Likvidlik sweep",
      passed: sweep,
      detail: sweep
        ? "Asosiy daraja sweep qilindi va qaytdi"
        : "Hali likvidlik sweep yo'q",
    },
    {
      label: "BOS / CHoCH",
      passed: structure,
      detail: structure ? "5M struktura buzildi" : "5M tasdiqlash kutilmoqda",
    },
    {
      label: "FVG yoki OB kirish",
      passed: entry,
      detail: entry
        ? "Kirish zonasi topildi"
        : "FVG/OB zona hali shakllanmagan",
    },
    {
      label: "R:R ≥ 1:2",
      passed: rr >= 2,
      detail: `Hozirgi R:R = 1:${rr.toFixed(1)}`,
    },
    {
      label: "1% risk",
      passed: true,
      detail: "Har bir savdoda kapitalning 1% risk",
    },
  ];
}

function computeScore(checklist: StrategyChecklistItem[]): number {
  const weights = [20, 25, 20, 20, 10, 5];
  let total = 0;
  checklist.forEach((item, i) => {
    if (item.passed) total += weights[i] ?? 0;
  });
  return total;
}

function determineVerdict(
  score: number,
  checklist: StrategyChecklistItem[],
): EmaSmcVerdict {
  const trendOk = checklist[0]!.passed;
  const sweepOk = checklist[1]!.passed;
  const structureOk = checklist[2]!.passed;
  const entryOk = checklist[3]!.passed;
  const rrOk = checklist[4]!.passed;

  if (trendOk && sweepOk && structureOk && entryOk && rrOk && score >= 75) {
    return "enter";
  }

  if (trendOk && (sweepOk || structureOk) && score >= 45) {
    return "wait";
  }

  return "avoid";
}

function buildReason(
  verdict: EmaSmcVerdict,
  side: TradeSide,
  sweep: boolean,
  structure: boolean,
  entryType: string | null,
): string {
  if (verdict === "enter") {
    return `${side === "long" ? "LONG" : "SHORT"} — sweep + ${structure ? "BOS/CHoCH" : ""} + ${entryType?.toUpperCase() ?? "kirish"} zona tayyor`;
  }
  if (verdict === "wait") {
    const missing: string[] = [];
    if (!sweep) missing.push("likvidlik sweep");
    if (!structure) missing.push("BOS/CHoCH");
    if (!entryType) missing.push("FVG/OB");
    return missing.length > 0
      ? `Trend mos — ${missing.join(", ")} kutilmoqda`
      : "Shartlar deyarli tayyor, kuzatishda qoling";
  }
  return side
    ? "Shartlar hali to'liq bajarilmagan"
    : "EMA 200 trend yo'nalishi aniqlanmadi";
}

export async function buildEmaSmcAnalysis(
  symbol: string,
  marketType: MarketType = "futures",
): Promise<EmaSmcAnalysis> {
  const [candles4h, candles1d, candles5m] = await Promise.all([
    getKlines(symbol, "4h", 300, marketType),
    getKlines(symbol, "1d", 60, marketType),
    getKlines(symbol, "5m", 500, marketType),
  ]);

  const closes4h = candles4h.map((c) => c.close);
  const ema200Series = calculateEMA(closes4h, 200);
  const ema200 = ema200Series[ema200Series.length - 1]!;
  const currentPrice = candles5m[candles5m.length - 1]!.close;

  let side: TradeSide = null;
  let trendDirection: "bullish" | "bearish" = "bullish";

  if (currentPrice > ema200) {
    side = "long";
    trendDirection = "bullish";
  } else if (currentPrice < ema200) {
    side = marketType === "futures" ? "short" : null;
    trendDirection = "bearish";
  }

  if (!side) {
    const checklist = buildChecklist(false, null, false, false, false, 0);
    return {
      symbol: symbol.toUpperCase(),
      marketType,
      currentPrice,
      side: null,
      verdict: "avoid",
      verdictLabel: VERDICT_LABELS.avoid,
      score: 0,
      reason:
        marketType === "spot"
          ? "Spot rejimda faqat BUY — narx EMA 200 dan past"
          : "EMA 200 trend yo'nalishi aniqlanmadi",
      ema200,
      trendDirection,
      keyLevels: { pdh: 0, pdl: 0, eqh: null, eql: null },
      sweep: null,
      structure: null,
      entryType: null,
      entryZone: null,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      checklist,
      generatedAt: new Date().toISOString(),
    };
  }

  const setup = buildSmcSetup(candles5m, candles1d, side);

  if (!setup) {
    const checklist = buildChecklist(true, side, false, false, false, 0);
    return {
      symbol: symbol.toUpperCase(),
      marketType,
      currentPrice,
      side,
      verdict: "wait",
      verdictLabel: VERDICT_LABELS.wait,
      score: computeScore(checklist),
      reason: "Kunlik darajalar hisoblanmadi",
      ema200,
      trendDirection,
      keyLevels: { pdh: 0, pdl: 0, eqh: null, eql: null },
      sweep: null,
      structure: null,
      entryType: null,
      entryZone: null,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      checklist,
      generatedAt: new Date().toISOString(),
    };
  }

  const hasSweep = setup.sweep !== null;
  const hasStructure = setup.structure !== null;
  const hasEntry = setup.entryZone !== null;

  const checklist = buildChecklist(
    true,
    side,
    hasSweep,
    hasStructure,
    hasEntry,
    setup.riskReward,
  );

  const score = computeScore(checklist);
  const verdict = determineVerdict(score, checklist);

  const entryZone: [number, number] | null = setup.entryZone
    ? [setup.entryZone.bottom, setup.entryZone.top]
    : null;

  return {
    symbol: symbol.toUpperCase(),
    marketType,
    currentPrice,
    side,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    score,
    reason: buildReason(verdict, side, hasSweep, hasStructure, setup.entryType),
    ema200,
    trendDirection,
    keyLevels: setup.keyLevels,
    sweep: setup.sweep
      ? { level: setup.sweep.level, levelType: setup.sweep.levelType }
      : null,
    structure: setup.structure
      ? { type: setup.structure.type, level: setup.structure.level }
      : null,
    entryType: setup.entryType,
    entryZone,
    stopLoss: setup.stopLoss,
    takeProfit: setup.takeProfit,
    riskReward: setup.riskReward,
    checklist,
    generatedAt: new Date().toISOString(),
  };
}
