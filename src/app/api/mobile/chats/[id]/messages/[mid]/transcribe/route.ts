import { NextResponse } from "next/server";
import { transcribeMessageAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Расшифровка голосового сообщения текстом (если подключена модель для голосовых). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string; mid: string }> }) => {
  await apiStaff(req, "chats.view");
  const { id, mid } = idParams(await params, "id", "mid");
  const r = await transcribeMessageAction(id, mid);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
