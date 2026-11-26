import { v1SiteProxy } from "@/server/v1-proxy";

type Ctx = { params: Promise<{ event: string }> };

export function POST(req: Request, ctx: Ctx) {
  return v1SiteProxy("orders", req, async () => (await import("@/server/site-handlers/payments/cloudpayments-webhook")).POST(req, ctx));
}
