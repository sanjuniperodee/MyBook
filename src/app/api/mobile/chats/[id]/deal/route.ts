import { NextResponse } from "next/server";
import { createDealFromChatAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Завести сделку из диалога (если она уже есть — вернёт её id). */
export const POST = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  await apiStaff(req, "chats.view", "deals.edit");
  const { id } = idParams(await params, "id");
  return NextResponse.json(await createDealFromChatAction(id));
});
