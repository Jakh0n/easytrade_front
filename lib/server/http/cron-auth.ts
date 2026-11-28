import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { verifyToken } from "../utils/token";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Cron (`Authorization: Bearer <CRON_SECRET>`) or a logged-in user (JWT). */
export function authorizeCronOrUser(request: NextRequest): void {
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
