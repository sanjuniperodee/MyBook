import { NextResponse } from "next/server";
import { forwardTargetsAction } from "@/app/admin/chats/actions";
import { apiStaff } from "@/server/api";
import { mobile } from "@/server/mobile-api";

export const dynamic = "force-dynamic";

/** Куда переслать сообщение: диалоги, которые сотрудник ведёт (поиск по имени и номеру). */
export const GET = mobile(async (req) => {
  await apiStaff(req, "chats.view", "chats.send");
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ targets: await forwardTargetsAction(q) });
});
