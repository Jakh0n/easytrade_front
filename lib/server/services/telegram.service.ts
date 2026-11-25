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

export async function sendTelegramMessage(
  text: string,
  options: { replyTo?: number | null } = {},
): Promise<number> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHANNEL_ID sozlanmagan");
  }

  const body: Record<string, unknown> = {
    chat_id: env.TELEGRAM_CHANNEL_ID,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  };
  if (options.replyTo) {
    body.reply_parameters = {
      message_id: options.replyTo,
      allow_sending_without_reply: true,
    };
  }

  const response = await fetch(
    `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  );

  const data = (await response.json()) as TelegramResponse;
  if (!data.ok) {
    throw new Error(data.description ?? "Telegram API xatosi");
  }
  return data.result?.message_id ?? 0;
}

/** Rasm + caption (HTML, ≤1024 belgi). message_id qaytaradi. */
export async function sendTelegramPhoto(
  photo: Buffer,
  caption: string,
  options: { replyTo?: number | null } = {},
): Promise<number> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHANNEL_ID sozlanmagan");
  }

  const form = new FormData();
  form.append("chat_id", env.TELEGRAM_CHANNEL_ID);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "chart.png");
  if (options.replyTo) {
    form.append(
      "reply_parameters",
      JSON.stringify({ message_id: options.replyTo, allow_sending_without_reply: true }),
    );
  }

  const response = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await response.json()) as TelegramResponse;
  if (!data.ok) {
    throw new Error(data.description ?? "Telegram API xatosi");
  }
  return data.result?.message_id ?? 0;
}
