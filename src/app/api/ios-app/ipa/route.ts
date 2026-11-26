import { v1SiteProxy } from "@/server/v1-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Handler = (req: Request) => Response | Promise<Response>;

const handler = async (method: "GET") => (await import("@/server/site-handlers/ios-app/ipa"))[method] as Handler;

export function GET(req: Request) {
  return v1SiteProxy("crm", req, async () => (await handler("GET"))(req));
}
