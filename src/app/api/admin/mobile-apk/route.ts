import { v1SiteProxy } from "@/server/v1-proxy";

export const maxDuration = 120;

type Handler = (req: Request) => Response | Promise<Response>;

const handler = async (method: "GET" | "POST") => (await import("@/server/site-handlers/admin/mobile-apk"))[method] as Handler;

export function GET(req: Request) {
  return v1SiteProxy("crm", req, async () => (await handler("GET"))(req));
}

export function POST(req: Request) {
  return v1SiteProxy("crm", req, async () => (await handler("POST"))(req));
}
