import { boardsApi } from "@/server/boards-api";

/** Доски задач CRM (server/boards-api.ts): путь после /api/admin/boards — и из Next, и из mybook-api (/api/v1/site/…). */
function pathOf(req: Request): string[] {
  const tail = new URL(req.url).pathname.replace(/^\/api\/v1\/site\//, "/api/").replace(/^\/api\/admin\/boards\/?/, "");
  return tail ? tail.split("/").map((s) => decodeURIComponent(s)) : [];
}

const handle = (req: Request) => boardsApi(req, pathOf(req));

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
