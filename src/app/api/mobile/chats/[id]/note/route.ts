import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInternalNoteAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Внутренняя заметка в диалоге: клиент её не видит, @упомянутые получают уведомление. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const { text } = z.object({ text: z.string().min(1).max(4000) }).parse(await req.json());
  return NextResponse.json(await sendInternalNoteAction(id, text));
});
