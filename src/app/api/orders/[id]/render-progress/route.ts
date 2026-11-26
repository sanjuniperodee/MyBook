import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("orders", req, async () => (await import("@/server/site-handlers/orders/render-progress")).GET(req, ctx));
}
