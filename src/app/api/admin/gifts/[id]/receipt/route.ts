import { v1SiteProxy } from "@/server/v1-proxy";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;

const handler = async (method: "POST" | "GET") => (await import("@/server/site-handlers/admin/gifts-id-receipt"))[method] as Handler;

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("POST"))(req, ctx));
}

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("GET"))(req, ctx));
}
