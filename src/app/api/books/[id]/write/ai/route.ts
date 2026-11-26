import { v1SiteProxy } from "@/server/v1-proxy";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("book", req, async () => (await import("@/server/site-handlers/books/write-ai")).POST(req, ctx));
}
