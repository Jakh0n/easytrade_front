import {
  createRouteHandler,
  noContent,
  requireUserId,
} from "@/lib/server/http/route";
import { removeWatchlistItem } from "@/lib/server/services/watchlist.service";

export const DELETE = createRouteHandler(
  async (ctx) => {
    await removeWatchlistItem(requireUserId(ctx), ctx.params.id);
    return noContent();
  },
  { requireDb: true, auth: true },
);
