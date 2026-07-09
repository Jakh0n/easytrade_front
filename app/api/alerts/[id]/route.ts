import {
  createRouteHandler,
  noContent,
  requireUserId,
} from "@/lib/server/http/route";
import { deleteAlert } from "@/lib/server/services/alert.service";

export const DELETE = createRouteHandler(
  async (ctx) => {
    await deleteAlert(requireUserId(ctx), ctx.params.id);
    return noContent();
  },
  { requireDb: true, auth: true },
);
