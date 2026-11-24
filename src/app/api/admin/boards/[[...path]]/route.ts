import { boardsApi } from "@/server/boards-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };
const handle = async (req: Request, { params }: Ctx) => boardsApi(req, (await params).path ?? []);

/** Доски задач CRM: доски, колонки, метки, правила, карточки, чек-листы, комментарии, вложения, календарь (server/boards-api.ts). */
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
