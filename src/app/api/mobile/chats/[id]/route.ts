import { NextResponse } from "next/server";
import { apiStaff } from "@/server/api";
import { idParams } from "@/server/input";
import { mobile } from "@/server/mobile-api";
import { mobileChatDetail } from "@/app/api/mobile/data";

export const dynamic = "force-dynamic";

/** Диалог целиком: шапка, сообщения (?limit=), права, шаблоны, сделка и счета. */
export const GET = mobile(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const staff = await apiStaff(req, "chats.view");
  const { id } = idParams(await params, "id");
  const limit = Math.min(300, Math.max(20, Number(new URL(req.url).searchParams.get("limit")) || 120));
  return NextResponse.json(await mobileChatDetail(staff, id, limit));
});
