/**
 * Server ishga tushganda MongoDB ga ulanadi. Signal sikli bu yerda emas — uni tashqi cron
 * (cron-job.org, har 5 daqiqada) `/api/signals/run` orqali chaqiradi.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { connectDatabase } = await import("@/lib/server/config/db");
  await connectDatabase();
}
