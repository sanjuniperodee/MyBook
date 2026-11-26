import { v1SiteProxy } from "@/server/v1-proxy";

export function POST(req: Request) {
  return v1SiteProxy("orders", req, async () => (await import("@/server/site-handlers/payments/kaspi-webhook")).POST(req));
}
