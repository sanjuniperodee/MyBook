import { v1SiteProxy } from "@/web/proxy";

export const maxDuration = 120;

export function POST(req: Request) {
  return v1SiteProxy(req);
}
