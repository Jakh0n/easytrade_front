import {
  createRouteHandler,
  json,
  requireUserId,
} from "@/lib/server/http/route";
import { updateUserSettings } from "@/lib/server/services/auth.service";
import {
  settingsSchema,
  type SettingsBody,
} from "@/lib/server/validators/auth.validator";

export const PATCH = createRouteHandler(
  async (ctx) => {
    const settings = ctx.body as SettingsBody;
    const user = await updateUserSettings(requireUserId(ctx), settings);
    return json({ user });
  },
  { requireDb: true, auth: true, bodySchema: settingsSchema },
);
