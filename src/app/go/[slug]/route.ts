import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ slug: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("public", req, async () => (await import("@/server/site-handlers/public/short-link")).GET(req, ctx));
}
