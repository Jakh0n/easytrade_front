import type { NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { isDatabaseConnected } from "../config/db";
import { AppError } from "../utils/AppError";
import { verifyToken } from "../utils/token";
import { handleRouteError } from "./errors";

export interface RouteContext {
  request: NextRequest;
  params: Record<string, string>;
  userId?: string;
  body?: unknown;
  query?: unknown;
}

export interface RouteOptions {
  auth?: boolean;
  requireDb?: boolean;
  bodySchema?: ZodType;
  querySchema?: ZodType;
}

function parseQuery(request: NextRequest): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

function parseValidationError(error: ZodError): AppError {
  const message = error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  return new AppError(message || "Validatsiya xatosi", 400);
}

export function createRouteHandler(
  handler: (ctx: RouteContext) => Promise<Response>,
  options: RouteOptions = {},
) {
  return async (
    request: NextRequest,
    segmentData?: { params?: Promise<Record<string, string>> },
  ): Promise<Response> => {
    try {
      const params = (await segmentData?.params) ?? {};
      const ctx: RouteContext = { request, params };

      if (options.requireDb && !isDatabaseConnected()) {
        throw new AppError(
          "Ma'lumotlar bazasi ulanmagan. Iltimos, birozdan so'ng urinib ko'ring.",
          503,
        );
      }

      if (options.auth) {
        const header = request.headers.get("authorization");
        if (!header?.startsWith("Bearer ")) {
          throw new AppError("Avtorizatsiya talab qilinadi", 401);
        }
        try {
          ctx.userId = verifyToken(header.slice(7)).userId;
        } catch {
          throw new AppError("Token yaroqsiz yoki muddati tugagan", 401);
        }
      }

      if (options.bodySchema) {
        const raw = await request.json().catch(() => ({}));
        try {
          ctx.body = options.bodySchema.parse(raw);
        } catch (error) {
          if (error instanceof ZodError) {
            throw parseValidationError(error);
          }
          throw error;
        }
      }

      if (options.querySchema) {
        try {
          ctx.query = options.querySchema.parse(parseQuery(request));
        } catch (error) {
          if (error instanceof ZodError) {
            throw parseValidationError(error);
          }
          throw error;
        }
      }

      return await handler(ctx);
    } catch (error) {
      return handleRouteError(error);
    }
  };
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function requireUserId(ctx: RouteContext): string {
  if (!ctx.userId) {
    throw new AppError("Avtorizatsiya talab qilinadi", 401);
  }
  return ctx.userId;
}

/** Creates a Server-Sent Events stream response. */
export function createSSEStream(
  generator: (
    write: (payload: { token?: string; error?: string }) => void,
  ) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (payload: { token?: string; error?: string }) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      try {
        await generator(write);
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        console.error("SSE oqim xatosi:", error);
        write({ error: "Oqimda xato yuz berdi" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
