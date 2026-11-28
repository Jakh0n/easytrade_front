import type { CheckResult, MarketSnapshot, Side } from "./types";

/**
 * Promptdagi 6 ta qoidaning deterministik ijrosi — yakuniy qaror shu yerdan chiqadi.
 * AI javobi faqat solishtirish/izoh uchun (LLM qoidani noto'g'ri qo'llashi mumkin).
 */
export const FUNDING_WARN_PCT = 0.05;
export const MAX_TRADES_PER_DAY = 3;
export const MAX_CONSECUTIVE_LOSSES = 2;
export const MIN_RR = 2;

export function trendSide(s: MarketSnapshot): Side | null {
  if (s.ema200_4h === null || s.structure_4h === null) return null;
  if (s.close > s.ema200_4h && s.structure_4h === "HH_HL") return "long";
  if (s.close < s.ema200_4h && s.structure_4h === "LH_LL") return "short";
  return null;
}

export function evaluateRules(s: MarketSnapshot): CheckResult {
  const warnings: string[] = [];
  const failed: string[] = [];
  const side = trendSide(s);
  const d = side ? s[side] : null;

  const trend = side !== null;
  if (!trend) {
    failed.push(
      s.ema200_4h === null || s.structure_4h === null
        ? "4H trend ma'lumoti yetishmaydi"
        : `4H trend aniq emas (close ${s.close}, EMA200 ${s.ema200_4h}, struktura ${s.structure_4h})`,
    );
  }

  const zone = Boolean(d?.zone && d.liquidity_sweep);
  if (trend && !zone) {
    failed.push(!d!.zone ? "narx trend yo'nalishidagi OB/FVG/SR zonasida emas" : "zonadan oldin liquidity sweep bo'lmagan");
  }

  const trigger = Boolean(d && (d.choch_5m || d.bos_5m));
  if (trend && !trigger) failed.push("5m da CHoCH/BOS tasdig'i yo'q");

  const filter = s.news_within_30min === false;
  if (s.news_within_30min === null) failed.push("yangiliklar ma'lumoti yo'q");
  else if (s.news_within_30min) failed.push("30 daqiqa ichida muhim yangilik bor");
  if (s.funding_rate_pct === null) warnings.push("Funding rate noma'lum");
  else if (Math.abs(s.funding_rate_pct) > FUNDING_WARN_PCT) warnings.push(`Funding juda yuqori: ${s.funding_rate_pct}%`);

  const plan = d?.plan ?? null;
  const risk_reward = plan !== null && plan.rr >= MIN_RR;
  if (trend && zone && !risk_reward) {
    failed.push(plan ? `R:R ${plan.rr} < ${MIN_RR} (keyingi likvidlik juda yaqin)` : "SL/TP hisoblab bo'lmadi");
  }

  const discipline =
    s.trades_today !== null &&
    s.consecutive_losses !== null &&
    s.trades_today < MAX_TRADES_PER_DAY &&
    s.consecutive_losses < MAX_CONSECUTIVE_LOSSES;
  if (s.trades_today === null || s.consecutive_losses === null) failed.push("intizom ma'lumoti yo'q");
  else if (!discipline) failed.push(`intizom: bugun ${s.trades_today} savdo, ketma-ket ${s.consecutive_losses} zarar`);

  const checks = { trend, zone, trigger, filter, risk_reward, discipline };
  const ok = Object.values(checks).every(Boolean);
  const trade = ok && side !== null && plan !== null;

  if (!trade) {
    return {
      decision: "NO_TRADE",
      symbol: s.symbol,
      checks,
      entry: null,
      stop_loss: null,
      tp1: null,
      tp2: null,
      rr: null,
      invalidation: "",
      confidence: "low",
      reason: `Savdo yo'q: ${failed.join("; ") || "shartlar bajarilmadi"}.`,
      warnings,
    };
  }

  const z = d!.zone!;
  const strong = z.type !== "SR" && d!.choch_5m && warnings.length === 0;
  return {
    decision: side === "long" ? "LONG" : "SHORT",
    symbol: s.symbol,
    checks,
    entry: plan.entry,
    stop_loss: plan.stop_loss,
    tp1: plan.tp1,
    tp2: plan.tp2,
    rr: plan.rr,
    invalidation: `${z.timeframe} close ${side === "long" ? "ostida" : "ustida"} ${plan.stop_loss} (sweep ${d!.sweep!.extreme} buzilsa)`,
    confidence: strong ? "high" : "medium",
    reason:
      `4H trend ${side === "long" ? "yuqoriga" : "pastga"}, narx ${z.timeframe} ${z.type} zonasida (${z.bottom}–${z.top}), ` +
      `${d!.sweep!.timeframe} da likvidlik olindi, 5m da ${d!.choch_5m ? "CHoCH" : "BOS"} tasdiqladi. R:R ${plan.rr}.`,
    warnings,
  };
}
