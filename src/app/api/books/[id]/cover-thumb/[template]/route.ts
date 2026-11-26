import { v1SiteProxy } from "@/server/v1-proxy";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string; template: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/cover-thumb")).GET(req, ctx));
}
