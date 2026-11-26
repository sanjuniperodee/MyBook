import { v1SiteProxy } from "@/web/proxy";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return v1SiteProxy(req);
}

export function PATCH(req: Request) {
  return v1SiteProxy(req);
}

export function DELETE(req: Request) {
  return v1SiteProxy(req);
}
