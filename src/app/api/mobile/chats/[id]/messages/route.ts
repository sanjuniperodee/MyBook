import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMessageAction } from "@/app/admin/chats/actions";
import { apiStaff, HttpError } from "@/server/api";
import { assertVisible } from "@/server/access";
import { container } from "@/server/container";
import { idParams } from "@/server/input";
import { jsonWithEtag, mobile } from "@/server/mobile-api";
import { mobileMessages } from "@/app/api/mobile/data";

export const dynamic = "force-dynamic";

/**
 * Лента диалога без шапки, шаблонов и счетов: ?limit= последних (живое обновление — новые сообщения, статусы доставки,
 * правки и удаления недавних), ?before=<ISO> — страница истории старше этого момента (прокрутка вверх). С ETag: если в
 * последних сообщениях ничего не изменилось — 304.
 */
export const GET = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const conv = await container().messaging.queries.conversation(id);
  if (!conv) throw new HttpError(404, "notFound");
  assertVisible(staff, conv.assigneeId);
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit")) || 40));
  const raw = url.searchParams.get("before");
  const before = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : undefined;
  return jsonWithEtag(req, { ...(await mobileMessages(conv.id, limit, before)), unread: conv.unread, status: conv.status });
});

const body = z.object({ text: z.string().max(4000), replyToId: z.string().uuid().nullish(), override: z.string().max(200).optional() });

/**
 * Сообщение клиенту: те же проверки, что в вебе (чужие реквизиты — { blocked } с объяснением; override — причина, чтобы
 * отправить всё равно). Файлы и голосовые — multipart на /api/admin/chats/<id>/files.
 */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view", "chats.send");
  const { id } = idParams(await params, "id");
  const b = body.parse(await req.json());
  return NextResponse.json(await sendMessageAction(id, b.text, b.override, b.replyToId ?? null));
});
