import { v1SiteProxy } from "@/server/v1-proxy";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; kind: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("orders", req, async () => (await import("@/server/site-handlers/orders/file")).GET(req, ctx));
}
