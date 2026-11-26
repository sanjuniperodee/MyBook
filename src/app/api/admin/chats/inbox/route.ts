import { v1SiteProxy } from "@/web/proxy";

export const dynamic = "force-dynamic";

/** Строки списка «Чатов» для живого обновления: собирает mybook-api (src/server/site-handlers/admin/chats-inbox.ts). */
export function GET(req: Request) {
  return v1SiteProxy(req);
}
