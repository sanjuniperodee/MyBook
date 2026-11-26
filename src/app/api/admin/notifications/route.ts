import { v1SiteProxy } from "@/server/v1-proxy";

type Handler = (req: Request) => Response | Promise<Response>;

const handler = async (method: "POST") => (await import("@/server/site-handlers/admin/notifications"))[method] as Handler;

export function POST(req: Request) {
  return v1SiteProxy("crm", req, async () => (await handler("POST"))(req));
}
