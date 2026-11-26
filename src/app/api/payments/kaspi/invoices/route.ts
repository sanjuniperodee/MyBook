import { v1SiteProxy } from "@/web/proxy";

export function POST(req: Request, _ctx?: unknown) {
  void _ctx;
  return v1SiteProxy(req);
}
