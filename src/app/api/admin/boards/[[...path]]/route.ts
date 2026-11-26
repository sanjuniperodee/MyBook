import { v1SiteProxy } from "@/server/v1-proxy";

export const dynamic = "force-dynamic";

/** Доски задач CRM: доски, колонки, метки, правила, карточки, чек-листы, комментарии, вложения, календарь (server/boards-api.ts). */
const handle = (req: Request) => v1SiteProxy("crm", req, async () => (await import("@/server/site-handlers/admin/boards")).GET(req));

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
