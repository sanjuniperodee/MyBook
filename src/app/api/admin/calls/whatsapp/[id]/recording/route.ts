import { v1SiteProxy } from "@/web/proxy";

export function POST(req: Request) {
  return v1SiteProxy(req);
}
