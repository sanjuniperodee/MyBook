import { v1SiteProxy } from "@/server/v1-proxy";

export function GET(req: Request) {
  return v1SiteProxy("public", req, async () => (await import("@/server/site-handlers/public/site-chat")).GET(req, undefined as never));
}

export function POST(req: Request) {
  return v1SiteProxy("public", req, async () => (await import("@/server/site-handlers/public/site-chat")).POST(req, undefined as never));
}
