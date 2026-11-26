import { v1SiteProxy } from "@/server/v1-proxy";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;

const handler = async (method: "GET" | "PATCH" | "DELETE") => (await import("@/server/site-handlers/mobile/tasks-id"))[method] as Handler;

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("GET"))(req, ctx));
}

export function PATCH(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("PATCH"))(req, ctx));
}

export function DELETE(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("DELETE"))(req, ctx));
}
