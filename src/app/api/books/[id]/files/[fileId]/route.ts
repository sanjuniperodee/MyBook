import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/file-item")).GET(req, ctx));
}

export function PUT(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/file-item")).PUT(req, ctx));
}

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/file-item")).POST(req, ctx));
}

export function DELETE(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/file-item")).DELETE(req, ctx));
}
