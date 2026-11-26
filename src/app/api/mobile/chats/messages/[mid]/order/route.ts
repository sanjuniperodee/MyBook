import { v1SiteProxy } from "@/server/v1-proxy";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ mid: string }> };
type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;

const handler = async (method: "GET") => (await import("@/server/site-handlers/mobile/chats-messages-mid-order"))[method] as Handler;

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("GET"))(req, ctx));
}
