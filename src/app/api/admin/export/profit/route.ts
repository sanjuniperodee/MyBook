import { v1SiteProxy } from "@/server/v1-proxy";

type Handler = (req: Request) => Response | Promise<Response>;

const handler = async (method: "GET") => (await import("@/server/site-handlers/admin/export-profit"))[method] as Handler;

export function GET(req: Request) {
  return v1SiteProxy("crm", req, async () => (await handler("GET"))(req));
}
