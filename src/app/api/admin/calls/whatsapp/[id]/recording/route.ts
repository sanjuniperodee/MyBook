import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;

const handler = async (method: "POST") => (await import("@/server/site-handlers/admin/calls-whatsapp-id-recording"))[method] as Handler;

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("POST"))(req, ctx));
}
