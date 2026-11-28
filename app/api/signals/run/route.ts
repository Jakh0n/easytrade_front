import type { NextRequest } from "next/server";
import { ensureDatabaseConnected } from "@/lib/server/config/db";
import { authorizeCronOrUser } from "@/lib/server/http/cron-auth";
import { handleRouteError } from "@/lib/server/http/errors";
import { runSignalCycle } from "@/lib/server/services/fq-signal.service";
import { AppError } from "@/lib/server/utils/AppError";

// 4 ta strategiya ketma-ket (dushanba kuni momentum savati ~200 coin ham) — 60s yetmasligi mumkin.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(request: NextRequest): Promise<Response> {
  try {
    authorizeCronOrUser(request);
    if (!(await ensureDatabaseConnected())) {
      throw new AppError("Ma'lumotlar bazasi ulanmagan", 503);
    }
    return Response.json(await runSignalCycle());
  } catch (error) {
    return handleRouteError(error);
  }
}

export const GET = handle;
export const POST = handle;
