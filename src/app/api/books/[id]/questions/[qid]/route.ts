import { v1SiteProxy } from "@/web/proxy";

export function PATCH(req: Request) {
  return v1SiteProxy(req);
}

export function DELETE(req: Request) {
  return v1SiteProxy(req);
}
