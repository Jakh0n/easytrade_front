import type { NextRequest } from "next/server";
import { ensureDatabaseConnected } from "@/lib/server/config/db";
import { env } from "@/lib/server/config/env";
import { authorizeCronOrUser } from "@/lib/server/http/cron-auth";
import { handleRouteError } from "@/lib/server/http/errors";
import { runEngineCycle } from "@/lib/server/signal-engine/runner";
import { AppError } from "@/lib/server/utils/AppError";

/** Signal engine v2 — cron-job.org calls this every minute (old pipelines stay on /api/signals/run). */
export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function handle(request: NextRequest): Promise<Response> {
  try {
    authorizeCronOrUser(request);
    if (!env.ENGINE_SIGNALS_ENABLED) return Response.json({ skipped: "ENGINE_SIGNALS_ENABLED=false" });
    if (!(await ensureDatabaseConnected())) {
      throw new AppError("Ma'lumotlar bazasi ulanmagan", 503);
    }
    return Response.json(await runEngineCycle());
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = handle;
export const POST = handle;
