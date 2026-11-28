/**
 * Signal tekshiruvchi uchun ma'lumot shakli. Snapshot — Binance shamlaridan hisoblangan
 * JSON (AI ga ham aynan shu yuboriladi), CheckResult — qoidalar natijasi (promptdagi format).
 */
export type Side = "long" | "short";
export type Decision = "LONG" | "SHORT" | "NO_TRADE";
export type ZoneType = "OB" | "FVG" | "SR";
export type ZoneTimeframe = "15m" | "1h";

export interface ZoneInfo {
  type: ZoneType;
  timeframe: ZoneTimeframe;
  top: number;
  bottom: number;
}

export interface SweepInfo {
  timeframe: ZoneTimeframe;
  /** Sweep qilingan swing low/high darajasi. */
  level: number;
  /** Sweep shamining soyasi (long uchun low, short uchun high) — SL shu ortida. */
  extreme: number;
  /** Sweep shami yopilgan vaqt (ISO). */
  time: string;
}

export interface TradePlan {
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  rr: number;
}

export interface SideSnapshot {
  /** Narx hozir ichida turgan, shu yo'nalishdagi OB/FVG/SR zonasi (15m yoki 1H). */
  zone: ZoneInfo | null;
  liquidity_sweep: boolean;
  sweep: SweepInfo | null;
  /** Sweep'dan keyin 5m da shu yo'nalishda CHoCH (struktura burilishi) yoki BOS (davomi). */
  choch_5m: boolean;
  bos_5m: boolean;
  /** Kirishdan keyingi eng yaqin olinmagan 1H likvidlik (swing high/low). */
  next_liquidity: number | null;
  /** Oldindan hisoblangan kirish/SL/TP — AI raqam o'ylab topmasligi uchun. */
  plan: TradePlan | null;
}

export type Structure4h = "HH_HL" | "LH_LL" | "MIXED";

export interface MarketSnapshot {
  symbol: string;
  time: string;
  /** Oxirgi yopilgan 5m sham close'i. */
  close: number;
  ema200_4h: number | null;
  structure_4h: Structure4h | null;
  atr_5m: number | null;
  long: SideSnapshot;
  short: SideSnapshot;
  /** Foizda: 0.01 = 0.01%. */
  funding_rate_pct: number | null;
  news_within_30min: boolean | null;
  trades_today: number | null;
  consecutive_losses: number | null;
}

export interface CheckResult {
  decision: Decision;
  symbol: string;
  checks: {
    trend: boolean;
    zone: boolean;
    trigger: boolean;
    filter: boolean;
    risk_reward: boolean;
    discipline: boolean;
  };
  entry: number | null;
  stop_loss: number | null;
  tp1: number | null;
  tp2: number | null;
  rr: number | null;
  invalidation: string;
  confidence: "low" | "medium" | "high";
  reason: string;
  warnings: string[];
}
