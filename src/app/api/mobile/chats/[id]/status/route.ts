import { NextResponse } from "next/server";
import { z } from "zod";
import { setConversationStatusAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Закрыть диалог (вопрос решён) или открыть снова. */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view", "chats.send");
  const { id } = idParams(await params, "id");
  const { status } = z.object({ status: z.enum(["open", "closed"]) }).parse(await req.json());
  await setConversationStatusAction(id, status);
  return NextResponse.json({ ok: true });
});
