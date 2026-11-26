import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ id: string; lid: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/letter-item")).PATCH(req, ctx));
}

export function DELETE(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/letter-item")).DELETE(req, ctx));
}
