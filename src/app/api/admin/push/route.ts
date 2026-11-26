import { v1SiteProxy } from "@/server/v1-proxy";

type Handler = (req: Request) => Response | Promise<Response>;

const handler = async (method: "GET" | "POST" | "DELETE") => (await import("@/server/site-handlers/admin/push"))[method] as Handler;

export function GET(req: Request) {
  return v1SiteProxy("crm", req, async () => (await handler("GET"))(req));
}

export function POST(req: Request) {
  return v1SiteProxy("crm", req, async () => (await handler("POST"))(req));
}

export function DELETE(req: Request) {
  return v1SiteProxy("crm", req, async () => (await handler("DELETE"))(req));
}
