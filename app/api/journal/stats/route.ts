import {
  createRouteHandler,
  json,
  requireUserId,
} from "@/lib/server/http/route";
import { getJournalStats } from "@/lib/server/services/journal.service";

export const GET = createRouteHandler(
  async (ctx) => {
    const stats = await getJournalStats(requireUserId(ctx));
    return json(stats);
  },
  { requireDb: true, auth: true },
);
