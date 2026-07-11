import { env } from "../config/env";

const TELEGRAM_API = "https://api.telegram.org";

export function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHANNEL_ID);
}

interface TelegramResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

async function callTelegram(
  method: string,
  body: FormData | Record<string, string>,
): Promise<TelegramResponse> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: isFormData ? undefined : { "Content-Type": "application/json" },
      body: isFormData ? body : JSON.stringify(body),
    },
  );

  const data = (await response.json()) as TelegramResponse;

  if (!data.ok) {
    throw new Error(data.description ?? "Telegram API xatosi");
  }

  return data;
}

export async function sendTelegramMessage(
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML",
): Promise<number> {
  if (!env.TELEGRAM_CHANNEL_ID) {
    throw new Error("TELEGRAM_CHANNEL_ID sozlanmagan");
  }

  const result = await callTelegram("sendMessage", {
    chat_id: env.TELEGRAM_CHANNEL_ID,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: "true",
  });

  return result.result?.message_id ?? 0;
}

export async function sendTelegramPhoto(
  image: Buffer,
  caption: string,
  filename: string = "chart.png",
): Promise<number> {
  if (!env.TELEGRAM_CHANNEL_ID) {
    throw new Error("TELEGRAM_CHANNEL_ID sozlanmagan");
  }

  const form = new FormData();
  form.append("chat_id", env.TELEGRAM_CHANNEL_ID);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append(
    "photo",
    new Blob([new Uint8Array(image)], { type: "image/png" }),
    filename,
  );

  const result = await callTelegram("sendPhoto", form);
  return result.result?.message_id ?? 0;
}
