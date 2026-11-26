import { v1SiteProxy } from "@/server/v1-proxy";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export function GET(req: Request, ctx: Ctx) {
  return v1SiteProxy("public", req, async () => (await import("@/server/site-handlers/public/calendar-feed")).GET(req, ctx));
}
