import { v1SiteProxy } from "@/server/v1-proxy";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/help")).GET(req, ctx));
}

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/help")).POST(req, ctx));
}
