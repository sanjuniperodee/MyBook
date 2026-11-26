import { v1SiteProxy } from "@/web/proxy";

export const maxDuration = 60;

export function GET(req: Request) {
  return v1SiteProxy(req);
}
