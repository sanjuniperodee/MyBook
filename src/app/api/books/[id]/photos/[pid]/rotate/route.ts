import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string; pid: string }> };

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/photo-rotate")).POST(req, ctx));
}
