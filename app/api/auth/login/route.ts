import {
  createRouteHandler,
  json,
} from "@/lib/server/http/route";
import { loginUser } from "@/lib/server/services/auth.service";
import { loginSchema, type LoginBody } from "@/lib/server/validators/auth.validator";

export const POST = createRouteHandler(
  async (ctx) => {
    const { email, password } = ctx.body as LoginBody;
    const result = await loginUser(email, password);
    return json(result);
  },
  { requireDb: true, bodySchema: loginSchema },
);
