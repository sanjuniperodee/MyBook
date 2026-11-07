import { NextResponse } from "next/server";
import { api, apiStaff } from "@/server/api";
import { inboxItems } from "@/app/admin/chats/inbox-items";
import { CHAT_FILTERS, type ChatFilter } from "@/components/admin/chat/inbox-model";

export const dynamic = "force-dynamic";

/** Строки списка «Чатов» (?f=, ?q=) для живого обновления списка без пересборки страницы. */
export const GET = api(async (req) => {
  const staff = await apiStaff(req, "chats.view");
  const url = new URL(req.url);
  const raw = url.searchParams.get("f") ?? "open";
  const f: ChatFilter = raw in CHAT_FILTERS ? (raw as ChatFilter) : "open";
  const q = url.searchParams.get("q")?.trim() || undefined;
  return NextResponse.json({ items: await inboxItems(staff, f, q) }, { headers: { "Cache-Control": "no-store" } });
});
