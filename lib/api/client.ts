/** Same-origin by default; set NEXT_PUBLIC_API_URL only for a separate API host. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TOKEN_KEY = "easytrade_token";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
  }

  const qs = params.toString();

  if (API_URL) {
    const url = new URL(`${API_URL}${path}`);
    params.forEach((value, key) => url.searchParams.set(key, value));
    return url.toString();
  }

  return qs ? `${path}?${qs}` : path;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, auth = false, query } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json()) as T | { error: string };

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? (data as { error: string }).error
        : "So'rovda xato yuz berdi";
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export interface StreamHandlers {
  onToken: (token: string) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

/**
 * Consumes a Server-Sent Events stream from a POST endpoint, parsing
 * `data: {token|error}` frames and stopping on `data: [DONE]`.
 */
export async function streamSSE(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ApiError("Oqim ulanmadi", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        handlers.onDone?.();
        return;
      }

      try {
        const parsed = JSON.parse(payload) as {
          token?: string;
          error?: string;
        };
        if (parsed.token) handlers.onToken(parsed.token);
        if (parsed.error) handlers.onError?.(parsed.error);
      } catch {
        // Ignore malformed frames.
      }
    }
  }

  handlers.onDone?.();
}
