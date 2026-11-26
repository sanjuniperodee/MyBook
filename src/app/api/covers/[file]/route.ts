import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ file: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/media/cover")).GET(req, ctx));
}
