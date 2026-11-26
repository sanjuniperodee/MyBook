import { NextResponse } from "next/server";
import { api, apiStaff } from "@/server/api";
import { runCrmOp } from "@/server/crm-ops/registry";
import { CHAT_FILTERS, type ChatFilter } from "@/lib/crm/inbox-model";

/** Строки списка «Чатов» (?f=, ?q=) для живого обновления списка без пересборки страницы. */
export const GET = api(async (req) => {
  await apiStaff(req, "chats.view");
  const url = new URL(req.url);
  const raw = url.searchParams.get("f") ?? "open";
  const f: ChatFilter = raw in CHAT_FILTERS ? (raw as ChatFilter) : "open";
  const q = url.searchParams.get("q")?.trim().slice(0, 200) || undefined;
  return NextResponse.json({ items: await runCrmOp("chats.inbox", { f, q }) }, { headers: { "Cache-Control": "no-store" } });
});
