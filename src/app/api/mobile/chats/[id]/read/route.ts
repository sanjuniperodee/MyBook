import { NextResponse } from "next/server";
import { markReadAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Диалог прочитан (сбрасывает счётчик; чужой ничей диалог менеджер только смотрит). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  await markReadAction(id);
  return NextResponse.json({ ok: true });
});
