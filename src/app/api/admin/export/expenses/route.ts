import { v1SiteProxy } from "@/web/proxy";

export function GET(req: Request) {
  return v1SiteProxy(req);
}
