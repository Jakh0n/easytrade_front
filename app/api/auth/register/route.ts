import {
  createRouteHandler,
  json,
} from "@/lib/server/http/route";
import {
  getUserProfile,
  loginUser,
  registerUser,
  updateUserSettings,
} from "@/lib/server/services/auth.service";
import {
  loginSchema,
  registerSchema,
  settingsSchema,
  type LoginBody,
  type RegisterBody,
  type SettingsBody,
} from "@/lib/server/validators/auth.validator";

export const POST = createRouteHandler(
  async (ctx) => {
    const { email, password, name } = ctx.body as RegisterBody;
    const result = await registerUser(email, password, name);
    return json(result, 201);
  },
  { requireDb: true, bodySchema: registerSchema },
);
