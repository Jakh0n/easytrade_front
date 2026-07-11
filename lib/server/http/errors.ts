import { AppError } from "../utils/AppError";

interface MongoLikeError {
  name?: string;
  code?: number;
}

export function resolveStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  const mongoError = error as MongoLikeError;

  if (mongoError.name === "CastError") {
    return 400;
  }

  if (mongoError.name === "ValidationError") {
    return 400;
  }

  if (mongoError.code === 11000) {
    return 409;
  }

  if (error instanceof Error && error.message.includes("topilmadi")) {
    return 400;
  }

  return 500;
}

export function resolveMessage(error: unknown, statusCode: number): string {
  const mongoError = error as MongoLikeError;

  if (mongoError.name === "CastError") {
    return "Noto'g'ri identifikator";
  }

  if (mongoError.code === 11000) {
    return "Bunday yozuv allaqachon mavjud";
  }

  if (error instanceof AppError) {
    return error.message;
  }

  if (statusCode >= 500) {
    return "Serverda kutilmagan xato yuz berdi";
  }

  return error instanceof Error ? error.message : "Kutilmagan xato yuz berdi";
}

export function handleRouteError(error: unknown): Response {
  const statusCode = resolveStatusCode(error);

  if (statusCode >= 500) {
    console.error("Server xatosi:", error);
  }

  return Response.json(
    { error: resolveMessage(error, statusCode) },
    { status: statusCode },
  );
}
