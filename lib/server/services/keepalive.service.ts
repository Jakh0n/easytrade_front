import axios from "axios";
import { env } from "../config/env";

/** Public base URL used for self-ping (Render sets RENDER_EXTERNAL_URL). */
export function getKeepAliveHealthUrl(): string | null {
  const base = env.APP_URL ?? process.env.RENDER_EXTERNAL_URL;
  if (!base) {
    return null;
  }

  return `${base.replace(/\/$/, "")}/health`;
}

/**
 * Hits /health on this service's public URL so Render (and similar hosts) see
 * inbound traffic and reset the idle spin-down timer (~15 min on free tier).
 */
export async function pingHealthEndpoint(): Promise<void> {
  const url = getKeepAliveHealthUrl();
  if (!url) {
    return;
  }

  const response = await axios.get<string>(url, {
    timeout: 15_000,
    validateStatus: (status) => status === 200,
    responseType: "text",
  });

  if (response.data.trim() !== "OK") {
    throw new Error(`Health javobi kutilmagan: ${response.data.slice(0, 50)}`);
  }
}
