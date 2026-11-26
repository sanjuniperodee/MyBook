import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;

const handler = async (method: "DELETE") => (await import("@/server/site-handlers/admin/payments-id"))[method] as Handler;

export function DELETE(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("DELETE"))(req, ctx));
}
