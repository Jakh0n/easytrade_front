import { createRouteHandler, json } from "@/lib/server/http/route";
import { STRATEGIES } from "@/lib/server/services/strategies.registry";

export const GET = createRouteHandler(async () => {
  return json({ strategies: STRATEGIES });
});
