export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { connectDatabase } = await import("@/lib/server/config/db");
  const { startSchedulers } = await import("@/lib/server/config/scheduler");

  await connectDatabase();
  startSchedulers();
}
