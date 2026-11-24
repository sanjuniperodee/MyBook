import { NextResponse } from "next/server";
import { resendMessageAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** «Повторить отправку» сообщения, которое шлюз не принял: тот же текст, та же запись (как в чате CRM). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string; mid: string }> }) => {
  await apiStaff(req, "chats.view", "chats.send");
  const { id, mid } = idParams(await params, "id", "mid");
  const r = await resendMessageAction(id, mid);
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
});
