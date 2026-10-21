import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteMessageAction, editMessageAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Изменить своё сообщение (WhatsApp разрешает в течение 15 минут). */
export const PATCH = mobile(async (req, { params }: { params: Promise<{ id: string; mid: string }> }) => {
  await apiStaff(req, "chats.view", "chats.send");
  const { id, mid } = idParams(await params, "id", "mid");
  const { text } = z.object({ text: z.string().min(1).max(4000) }).parse(await req.json());
  const r = await editMessageAction(id, mid, text);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});

/** Удалить сообщение у всех. */
export const DELETE = mobile(async (req, { params }: { params: Promise<{ id: string; mid: string }> }) => {
  await apiStaff(req, "chats.view", "chats.send");
  const { id, mid } = idParams(await params, "id", "mid");
  const r = await deleteMessageAction(id, mid);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
