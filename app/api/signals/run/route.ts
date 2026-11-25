import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ensureDatabaseConnected } from "@/lib/server/config/db";
import { env } from "@/lib/server/config/env";
import { handleRouteError } from "@/lib/server/http/errors";
import { runSignalCycle } from "@/lib/server/services/fq-signal.service";
import { AppError } from "@/lib/server/utils/AppError";
import { verifyToken } from "@/lib/server/utils/token";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Cron (CRON_SECRET) yoki tizimga kirgan foydalanuvchi (JWT) chaqira oladi. */
function authorize(request: NextRequest): void {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new AppError("Avtorizatsiya talab qilinadi", 401);
  if (env.CRON_SECRET && safeEqual(token, env.CRON_SECRET)) return;
  try {
    verifyToken(token);
  } catch {
    throw new AppError("Ruxsat yo'q", 401);
  }
}

async function handle(request: NextRequest): Promise<Response> {
  try {
    authorize(request);
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
