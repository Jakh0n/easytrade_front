import {
  createRouteHandler,
  json,
  noContent,
  requireUserId,
} from "@/lib/server/http/route";
import {
  addWatchlistItem,
  listWatchlist,
} from "@/lib/server/services/watchlist.service";
import {
  watchlistAddSchema,
  type WatchlistAddBody,
} from "@/lib/server/validators/persist.validator";

export const GET = createRouteHandler(
  async (ctx) => {
    const items = await listWatchlist(requireUserId(ctx));
    return json({ items });
  },
  { requireDb: true, auth: true },
);

export const POST = createRouteHandler(
  async (ctx) => {
    const body = ctx.body as WatchlistAddBody;
    const item = await addWatchlistItem(requireUserId(ctx), body);
    return json({ item }, 201);
  },
  { requireDb: true, auth: true, bodySchema: watchlistAddSchema },
);
