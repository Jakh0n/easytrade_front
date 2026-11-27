import OpenAI from "openai";
import { env } from "../config/env";

/**
 * ChatGPT izohi — signal yuborilgandan keyin unga reply sifatida qisqa tahlil.
 * Bu FILTR EMAS: signal qoidalar bo'yicha allaqachon tanlangan (AI'ni backtest qilib bo'lmaydi).
 * AI faqat kontekstni o'qib, asosiy xavf va tasdiqlovchi omillarni odam tilida aytadi.
 * Kalit yo'q, o'chirilgan yoki xato bo'lsa — null (signal oqimiga ta'sir qilmaydi).
 */
let client: OpenAI | null = null;

export function isAiCommentaryEnabled(): boolean {
  return env.AI_COMMENTARY_ENABLED && Boolean(env.OPENAI_API_KEY);
}

function getClient(): OpenAI {
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 25_000, maxRetries: 1 });
  return client;
}

const INSTRUCTIONS = [
  "Sen kripto futures savdogarisan. Senga avtomatik strategiya bergan signal va uning konteksti beriladi.",
  "Signalni baholab, o'zbek tilida (lotin) 2–4 ta qisqa gap yoz:",
  "1) grafik va kontekst signalni qanchalik tasdiqlaydi, 2) eng katta xavf nima (masalan yaqin qarshilik, gavjum funding, bozor rejimiga qarshi, haddan tashqari cho'zilgan narx), 3) bitta amaliy maslahat.",
  "Kafolat berma, foiz va narxlarni o'ylab topma — faqat berilgan ma'lumotdan foydalan. Markdown ishlatma, faqat oddiy matn.",
].join(" ");

export interface CommentaryInput {
  /** Signalning matnli tavsifi (strategiya, tomon, darajalar, indikatorlar, rejim, funding, model ehtimoli). */
  context: string;
  /** Signal grafigi (PNG) — bo'lsa, AI uni ham ko'radi. */
  chart?: Buffer | null;
}

export async function generateSignalCommentary(input: CommentaryInput): Promise<string | null> {
  if (!isAiCommentaryEnabled()) return null;
  try {
    const content: OpenAI.Responses.ResponseInputContent[] = [{ type: "input_text", text: input.context }];
    if (input.chart) {
      content.push({
        type: "input_image",
        image_url: `data:image/png;base64,${input.chart.toString("base64")}`,
        detail: "low",
      });
    }
    const response = await getClient().responses.create({
      model: env.OPENAI_MODEL,
      instructions: INSTRUCTIONS,
      input: [{ role: "user", content }],
      max_output_tokens: 600,
    });
    const text = response.output_text?.trim();
    return text ? text.slice(0, 1500) : null;
  } catch (error) {
    console.error("AI izoh:", error instanceof Error ? error.message : error);
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<a [^>]*>.*?<\/a>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Signal xabariga AI izohini reply qiladi. Hech qachon xato tashlamaydi —
 * AI yoki Telegram ishlamasa signal baribir yuborilgan bo'ladi.
 */
export async function replyWithAiCommentary(
  messageId: number,
  signalHtml: string,
  chart: Buffer | null,
  send: (text: string, options: { replyTo: number }) => Promise<number>,
): Promise<void> {
  if (!isAiCommentaryEnabled()) return;
  const text = await generateSignalCommentary({ context: stripHtml(signalHtml), chart });
  if (!text) return;
  await send(`🤖 <b>AI izoh</b>\n${escapeHtml(text)}`, { replyTo: messageId }).catch((error) => {
    console.error("AI izoh yuborilmadi:", error instanceof Error ? error.message : error);
  });
}
