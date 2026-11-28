import { z } from "zod";
import { createRouteHandler, json } from "@/lib/server/http/route";
import { getEngineStats } from "@/lib/server/signal-engine/service";

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/** GET /api/engine/stats?days=30 — per-strategy / per-regime / per-grade performance of engine v2. */
export const GET = createRouteHandler(
  async (ctx) => {
    const { days } = ctx.query as z.infer<typeof querySchema>;
    return json(await getEngineStats(days));
  },
  { auth: true, requireDb: true, querySchema },
);
