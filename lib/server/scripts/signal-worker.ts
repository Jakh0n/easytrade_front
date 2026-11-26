/**
 * Faqat signal sikli (Next.js serverisiz): har 5 daqiqada skaner → Telegram.
 *
 * Boshqa loyiha bilan bitta Render servisida ishlash uchun mo'ljallangan, shuning uchun
 * sozlamalar FAQAT `TRADE_` prefiksli o'zgaruvchilardan olinadi (TRADE_MONGODB_URI,
 * TRADE_TELEGRAM_BOT_TOKEN, ...). Qo'shni loyihaning MONGODB_URI / TELEGRAM_BOT_TOKEN /
 * JWT_SECRET kabi o'zgaruvchilari bu jarayonda o'chiriladi — ularga hech qachon yozilmaydi.
 *
 * Ishga tushirish: `npm run worker` (yoki `node --import tsx lib/server/scripts/signal-worker.ts`).
 */

const PREFIX = "TRADE_";
/** env.ts dagi kalitlar (NODE_ENV dan tashqari) — hammasi faqat TRADE_ dan olinadi. */
const KEYS = [
  "MONGODB_URI",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "APP_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHANNEL_ID",
  "TELEGRAM_SIGNALS_ENABLED",
  "TELEGRAM_SIGNAL_MARKET",
  "TELEGRAM_MAX_SIGNALS_PER_RUN",
  "TELEGRAM_MAX_SIGNALS_PER_DAY",
  "DAY_SIGNALS_ENABLED",
  "FQ_1H_SIGNALS_ENABLED",
  "FQ_4H_SIGNALS_ENABLED",
  "TELEGRAM_SIGNAL_CRON",
  "CRON_SECRET",
  "ALLOW_REGISTRATION",
] as const;
const REQUIRED = ["MONGODB_URI", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHANNEL_ID"] as const;

const SELF_PING_MS = 10 * 60_000;

/**
 * Alohida Render web servisi sifatida ishlaganda (TRADE_STANDALONE=true): Render port ochilishini
 * talab qiladi va Free tarifda 15 daqiqa so'rovsiz qolsa uxlatadi — shuning uchun /health va
 * o'z public URL'iga har 10 daqiqada ping.
 */
async function startHealthServer(selfUrl: string | undefined): Promise<void> {
  const port = Number(process.env.PORT);
  if (!port) return;
  const { createServer } = await import("node:http");
  createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  }).listen(port, () => console.log(`[trade-worker] /health port ${port}`));

  if (!selfUrl) return;
  const url = `${selfUrl.replace(/\/$/, "")}/health`;
  setInterval(() => {
    fetch(url, { signal: AbortSignal.timeout(15_000) }).catch((error) =>
      console.error("[trade-worker] self-ping xatosi:", error instanceof Error ? error.message : error),
    );
  }, SELF_PING_MS);
}

function isolateEnv(): string[] {
  for (const key of KEYS) {
    const own = process.env[PREFIX + key];
    delete process.env[key];
    if (own !== undefined && own !== "") process.env[key] = own;
  }
  // Qo'shni servisning public URL'i — scheduler keep-alive'i uni ping qilmasin
  // (alohida servisda o'z URL'imizni startHealthServer o'zi ping qiladi).
  delete process.env.RENDER_EXTERNAL_URL;
  delete process.env.VERCEL;
  process.env.TELEGRAM_SIGNALS_ENABLED ??= "true";
  return REQUIRED.filter((key) => !process.env[key]).map((key) => PREFIX + key);
}

async function main(): Promise<void> {
  const standalone = process.env.TRADE_STANDALONE === "true";
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  const missing = isolateEnv();
  if (standalone) await startHealthServer(selfUrl);
  if (missing.length) {
    // 0 kod bilan chiqamiz — qayta ishga tushirish sikli aylanmasin, qo'shni loyiha ta'sirlanmaydi.
    console.error(`[trade-worker] Sozlanmagan: ${missing.join(", ")} — worker ishga tushmadi.`);
    process.exit(0);
  }

  // env.ts import paytida o'qiladi — shuning uchun faqat izolyatsiyadan keyin import qilinadi.
  const { connectDatabase } = await import("../config/db");
  const { startSchedulers } = await import("../config/scheduler");
  const { env } = await import("../config/env");

  await connectDatabase();
  startSchedulers();
  console.log(
    `[trade-worker] ishga tushdi · cron ${env.TELEGRAM_SIGNAL_CRON} · bozor ${env.TELEGRAM_SIGNAL_MARKET} · day ${env.DAY_SIGNALS_ENABLED ? "yoqilgan" : "o'chiq"}`,
  );
}

process.on("unhandledRejection", (error) => {
  console.error("[trade-worker] unhandledRejection:", error instanceof Error ? error.message : error);
});

main().catch((error) => {
  console.error("[trade-worker] ishga tushmadi:", error instanceof Error ? error.message : error);
  process.exit(1);
});
