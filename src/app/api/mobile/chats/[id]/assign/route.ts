import { NextResponse } from "next/server";
import { z } from "zod";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { assignConversationAction } from "@/app/admin/chats/actions";

export const dynamic = "force-dynamic";

/** Передать диалог сотруднику ({ userId }) или снять ответственного ({ userId: null }). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view", "chats.send");
  const { id } = idParams(await params, "id");
  const { userId } = z.object({ userId: z.string().uuid().nullable() }).parse(await req.json());
  await assignConversationAction(id, userId);
  return NextResponse.json({ ok: true });
});
