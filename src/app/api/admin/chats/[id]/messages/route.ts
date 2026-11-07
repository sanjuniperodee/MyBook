import { NextResponse } from "next/server";
import { api, apiStaff, HttpError } from "@/server/api";
import { canSeeAssigned } from "@/server/access";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

export const dynamic = "force-dynamic";

/**
 * Сообщения открытого диалога для живого обновления и истории — без пересборки всей страницы чатов (она тянет список,
 * сделку, шаблоны, счета и т. д.: на телефоне ~250 КБ на каждое событие). ?limit= — сколько последних (по умолчанию 60:
 * новые и статусы доставки недавних); ?before=<ISO> — страница истории старше этого момента (прокрутка вверх).
 * Тот же вид сообщений, что у страницы (ChatPanel), и та же видимость диалога.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const c = container();
  const conv = await c.messaging.queries.conversation(id);
  if (!conv || !canSeeAssigned(staff, conv.assigneeId)) throw new HttpError(404, "notFound");
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit")) || 60));
  const raw = url.searchParams.get("before");
  const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : undefined;
  const messages = await c.messaging.view.messages(conv.id, limit, before);
  return NextResponse.json({ messages, more: messages.length === limit }, { headers: { "Cache-Control": "no-store" } });
});
