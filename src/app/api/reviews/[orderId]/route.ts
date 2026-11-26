import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ orderId: string }> };

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("public", req, async () => (await import("@/server/site-handlers/public/review-submit")).POST(req, ctx));
}
