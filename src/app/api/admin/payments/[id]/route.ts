import { v1SiteProxy } from "@/web/proxy";

export function DELETE(req: Request) {
  return v1SiteProxy(req);
}
