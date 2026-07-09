import {
  createRouteHandler,
  json,
  requireUserId,
} from "@/lib/server/http/route";
import { getUserProfile } from "@/lib/server/services/auth.service";

export const GET = createRouteHandler(
  async (ctx) => {
    const user = await getUserProfile(requireUserId(ctx));
    return json({ user });
  },
  { requireDb: true, auth: true },
);
