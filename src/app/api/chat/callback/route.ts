import { v1SiteProxy } from "@/server/v1-proxy";

export function POST(req: Request) {
  return v1SiteProxy("public", req, async () => (await import("@/server/site-handlers/public/site-callback")).POST(req, undefined as never));
}
