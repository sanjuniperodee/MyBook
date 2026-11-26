import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("public", req, async () => (await import("@/server/site-handlers/public/review-photo")).GET(req, ctx));
}
