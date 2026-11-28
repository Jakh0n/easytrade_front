import { z } from "zod";
import { createRouteHandler, json } from "@/lib/server/http/route";
import { getEngineSignals } from "@/lib/server/signal-engine/service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** 1 = also return missed / rejected / suppressed / capped rows. */
  all: z.enum(["0", "1"]).default("0"),
});

/** GET /api/engine/signals?limit=100&all=0 — recent engine v2 signals. */
export const GET = createRouteHandler(
  async (ctx) => {
    const q = ctx.query as z.infer<typeof querySchema>;
    return json({ signals: await getEngineSignals(q.limit, q.all === "1") });
  },
  { auth: true, requireDb: true, querySchema },
);
