import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMessageAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

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
