import { v1SiteProxy } from "@/web/proxy";

export function GET(req: Request) {
  return v1SiteProxy(req);
}

export function POST(req: Request) {
  return v1SiteProxy(req);
}
