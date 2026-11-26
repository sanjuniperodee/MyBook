import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string; pid: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/photo-edit")).GET(req, ctx));
}

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/photo-edit")).POST(req, ctx));
}

export function DELETE(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/photo-edit")).DELETE(req, ctx));
}
