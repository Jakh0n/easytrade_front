import OpenAI from "openai";
import { env } from "../config/env";
import type { AnalysisInput } from "../types/index";

const SYSTEM_MESSAGE = `Sen professional kripto trading tahlilchisan. Foydalanuvchiga moliyaviy maslahat emas.

Qoidalar:
- O'zbek tilida, maksimum 150 so'z
- 3 qisqa paragraph: tanlangan strategiya bo'yicha holat, kirish/kutish sababi, risk nuqtasi
- Faqat berilgan strategiyani tushuntir — boshqa strategiya taklif qilma
- Aniq buy/sell buyrug'i bermagin
- Oxirida "Bu moliyaviy maslahat emas" deb yoz`;

let client: OpenAI | null = null;

export function isOpenAiConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

export function getClient(): OpenAI {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY muhit o'zgaruvchisi sozlanmagan");
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
}

function buildUserPrompt(data: AnalysisInput): string {
  const checklistText = data.strategy.checklist
    .map(
      (item) => `- ${item.label}: ${item.passed ? "✓" : "✗"} (${item.detail})`,
    )
    .join("\n");

  return `Quyidagi ${data.symbol} ${data.marketType.toUpperCase()} ma'lumotlarini tahlil qil:

Bozor turi: ${data.marketType === "futures" ? "Futures (long/short)" : "Spot (faqat long)"}
Joriy narx: ${data.currentPrice}
Trend: ${data.trend}

Tanlangan strategiya: ${data.strategy.label} (${data.strategy.confidence}% ishonch)
Tavsif: ${data.strategy.description}

Strategiya checklist:
${checklistText}

Verdikt: ${data.verdict.verdictLabel} — ${data.verdict.headline}
Sababi: ${data.verdict.reason}
Kirish zonasi: ${data.verdict.entryZone[0]} – ${data.verdict.entryZone[1]}
Invalidation: ${data.verdict.invalidation}
${data.verdict.btcNote ? `BTC bozor rejimi: ${data.verdict.btcNote}` : ""}

Indikatorlar:
- EMA50: ${data.indicators.ema50}
- EMA200: ${data.indicators.ema200}
- RSI(14): ${data.indicators.rsi}
- ATR(14): ${data.indicators.atr}
- Support: ${data.indicators.support}
- Resistance: ${data.indicators.resistance}
- Volume holati: ${data.indicators.volumeStatus}

${
  data.verdict.pattern
    ? `Sham formatsiyasi: ${data.verdict.pattern.label} (${data.verdict.pattern.direction}${data.verdict.pattern.volumeConfirmed ? ", volume tasdiqlagan" : ""})`
    : "Sham formatsiyasi: aniqlanmadi"
}

Risk darajalari:
- Stop Loss: ${data.risk.stopLoss}
- Take Profit: ${data.risk.takeProfit}
- Position Size: ${data.risk.positionSize}
- Riskdagi pul: ${data.risk.riskAmount.toFixed(2)} USD
- Risk/Reward: ${data.risk.riskRewardRatio}
${
  data.risk.futures
    ? `- Leverage tavsiyasi: ${data.risk.futures.suggestedLeverage}x (maksimum xavfsiz: ${data.risk.futures.maxSafeLeverage}x, isolated margin)`
    : ""
}

${data.strategy.label} strategiyasi bo'yicha qisqa tahlil yoz.`;
}

export async function generateAnalysis(data: AnalysisInput): Promise<string> {
  const model = env.OPENAI_MODEL;
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model,
    max_tokens: 400,
    messages: [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: buildUserPrompt(data) },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI dan bo'sh javob qaytdi");
  }

  return content;
}

export async function* streamAnalysis(
  data: AnalysisInput,
): AsyncGenerator<string> {
  const openai = getClient();

  const stream = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    max_tokens: 400,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: buildUserPrompt(data) },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

const CHAT_SYSTEM_MESSAGE = `Sen professional kripto trading yordamchisisan. O'zbek tilida qisqa va aniq javob ber.
- Foydalanuvchiga moliyaviy maslahat berma, faqat texnik kontekstni tushuntir.
- Berilgan joriy setup ma'lumotlaridan foydalan.
- Aniq buy/sell buyrug'i berma.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function* streamChat(
  messages: ChatMessage[],
  context?: string,
): AsyncGenerator<string> {
  const openai = getClient();

  const systemContent = context
    ? `${CHAT_SYSTEM_MESSAGE}\n\nJoriy setup:\n${context}`
    : CHAT_SYSTEM_MESSAGE;

  const stream = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.4,
    stream: true,
    messages: [{ role: "system", content: systemContent }, ...messages],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}
