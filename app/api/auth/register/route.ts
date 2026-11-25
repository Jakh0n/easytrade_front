import {
  createRouteHandler,
  json,
} from "@/lib/server/http/route";
import { registerUser } from "@/lib/server/services/auth.service";
import { registerSchema, type RegisterBody } from "@/lib/server/validators/auth.validator";

export const POST = createRouteHandler(
  async (ctx) => {
    const { email, password, name } = ctx.body as RegisterBody;
    const result = await registerUser(email, password, name);
    return json(result, 201);
  },
  { requireDb: true, bodySchema: registerSchema },
);
