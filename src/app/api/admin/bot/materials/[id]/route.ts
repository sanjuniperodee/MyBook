import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;

const handler = async (method: "GET") => (await import("@/server/site-handlers/admin/bot-materials-id"))[method] as Handler;

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("GET"))(req, ctx));
}
