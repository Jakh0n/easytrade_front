import OpenAI from "openai";
import { z } from "zod";
import { env } from "../../config/env";
import type { CheckResult, MarketSnapshot } from "./types";

/**
 * AI tekshiruvchi: snapshot JSON'ini prompt qoidalari bo'yicha tekshiradi.
 * Javob Structured Outputs (strict JSON schema) bilan majburlanadi va zod bilan qayta tekshiriladi.
 * Kalit yo'q yoki xato bo'lsa — null.
 */
export const CHECKER_INSTRUCTIONS = `Sen kripto futures signal tekshiruvchisisan. Senga JSON formatida bozor ma'lumotlari
beriladi (narxlar va indikatorlar allaqachon hisoblangan). Vazifang — ularni quyidagi
qoidalar bo'yicha tekshirish. Hech qachon ma'lumotda yo'q raqamni o'ylab topma.

MA'LUMOT TUZILISHI: "long" va "short" bo'limlari har bir yo'nalish uchun zona, sweep, 5m trigger
va oldindan hisoblangan "plan" (entry, stop_loss, tp1, tp2, rr) ni beradi. Faqat trend yo'nalishidagi
bo'limni ishlat. entry/stop_loss/tp1/tp2/rr ni faqat "plan" dan ol. funding_rate_pct foizda berilgan.

QOIDALAR:
1. Trend (4H): close > ema200_4h VA structure_4h == "HH_HL" → faqat LONG.
   close < ema200_4h VA structure_4h == "LH_LL" → faqat SHORT. Aks holda NO_TRADE.
2. Zona (15m/1H): narx trend yo'nalishidagi OB/FVG/SR zonasi ichida bo'lishi (zone != null)
   va undan oldin liquidity_sweep == true bo'lishi shart.
3. Trigger (5m): trend yo'nalishida choch_5m yoki bos_5m == true.
4. Filtr: news_within_30min == true (yoki null) → NO_TRADE. funding juda yuqori
   (|funding_rate_pct| > 0.05) → warnings ga qo'sh.
5. Risk: SL — sweep qilingan swing low/high orqasida. TP1 = 1R, TP2 = keyingi
   likvidlik yoki 2–3R. R:R < 2 → NO_TRADE.
6. Intizom: trades_today >= 3 yoki consecutive_losses >= 2 (yoki null) → NO_TRADE.

Har qanday shart bajarilmasa yoki ma'lumot yetishmasa → NO_TRADE va entry/stop_loss/tp1/tp2/rr = null.
Faqat berilgan JSON schema bo'yicha javob qaytar. "reason" — qisqa izoh, o'zbek tilida.`;

const nullableNumber = { type: ["number", "null"] } as const;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "symbol", "checks", "entry", "stop_loss", "tp1", "tp2", "rr", "invalidation", "confidence", "reason", "warnings"],
  properties: {
    decision: { type: "string", enum: ["LONG", "SHORT", "NO_TRADE"] },
    symbol: { type: "string" },
    checks: {
      type: "object",
      additionalProperties: false,
      required: ["trend", "zone", "trigger", "filter", "risk_reward", "discipline"],
      properties: {
        trend: { type: "boolean" },
        zone: { type: "boolean" },
        trigger: { type: "boolean" },
        filter: { type: "boolean" },
        risk_reward: { type: "boolean" },
        discipline: { type: "boolean" },
      },
    },
    entry: nullableNumber,
    stop_loss: nullableNumber,
    tp1: nullableNumber,
    tp2: nullableNumber,
    rr: nullableNumber,
    invalidation: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    reason: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

const resultSchema = z.object({
  decision: z.enum(["LONG", "SHORT", "NO_TRADE"]),
  symbol: z.string(),
  checks: z.object({
    trend: z.boolean(),
    zone: z.boolean(),
    trigger: z.boolean(),
    filter: z.boolean(),
    risk_reward: z.boolean(),
    discipline: z.boolean(),
  }),
  entry: z.number().nullable(),
  stop_loss: z.number().nullable(),
  tp1: z.number().nullable(),
  tp2: z.number().nullable(),
  rr: z.number().nullable(),
  invalidation: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  warnings: z.array(z.string()),
}) satisfies z.ZodType<CheckResult>;

let client: OpenAI | null = null;

export function isAiCheckerEnabled(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export async function checkWithAi(snapshot: MarketSnapshot): Promise<CheckResult | null> {
  if (!isAiCheckerEnabled()) return null;
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 1 });
  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      instructions: CHECKER_INSTRUCTIONS,
      input: JSON.stringify(snapshot),
      text: { format: { type: "json_schema", name: "signal_check", schema: RESPONSE_SCHEMA, strict: true } },
      max_output_tokens: 2000,
    });
    return resultSchema.parse(JSON.parse(response.output_text));
  } catch (error) {
    console.error("AI tekshiruv:", error instanceof Error ? error.message : error);
    return null;
  }
}
