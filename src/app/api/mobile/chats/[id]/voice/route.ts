import { v1SiteProxy } from "@/server/v1-proxy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;

const handler = async (method: "POST") => (await import("@/server/site-handlers/mobile/chats-id-voice"))[method] as Handler;

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("crm", req, async () => (await handler("POST"))(req, ctx));
}
