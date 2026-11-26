import { v1SiteProxy } from "@/web/proxy";

export function PUT(req: Request) {
  return v1SiteProxy(req);
}
