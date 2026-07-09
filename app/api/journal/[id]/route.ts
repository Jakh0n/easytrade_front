import {
  createRouteHandler,
  noContent,
  requireUserId,
} from "@/lib/server/http/route";
import { deleteTrade } from "@/lib/server/services/journal.service";

export const DELETE = createRouteHandler(
  async (ctx) => {
    await deleteTrade(requireUserId(ctx), ctx.params.id);
    return noContent();
  },
  { requireDb: true, auth: true },
);
