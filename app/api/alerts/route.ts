import {
  createRouteHandler,
  json,
  noContent,
  requireUserId,
} from "@/lib/server/http/route";
import {
  createAlert,
  listAlerts,
} from "@/lib/server/services/alert.service";
import {
  alertCreateSchema,
  type AlertCreateBody,
} from "@/lib/server/validators/persist.validator";

export const GET = createRouteHandler(
  async (ctx) => {
    const status = ctx.request.nextUrl.searchParams.get("status") ?? undefined;
    const alerts = await listAlerts(requireUserId(ctx), status);
    return json({ alerts });
  },
  { requireDb: true, auth: true },
);

export const POST = createRouteHandler(
  async (ctx) => {
    const body = ctx.body as AlertCreateBody;
    const alert = await createAlert(requireUserId(ctx), body);
    return json({ alert }, 201);
  },
  { requireDb: true, auth: true, bodySchema: alertCreateSchema },
);
