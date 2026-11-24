import { apiStaff } from "@/server/api";
import { jsonWithEtag, mobile } from "@/server/mobile-api";
import { CHAT_FILTERS, mobileChatList, type ChatFilterId } from "@/app/api/mobile/data";

export const dynamic = "force-dynamic";

/** Список диалогов: ?f=open|mine|unread|waiting|closed&q=поиск. С ETag — без изменений отвечает 304. */
export const GET = mobile(async (req) => {
  const staff = await apiStaff(req, "chats.view");
  const url = new URL(req.url);
  const f = url.searchParams.get("f") as ChatFilterId;
  const filter = CHAT_FILTERS.includes(f) ? f : "open";
  return jsonWithEtag(req, { chats: await mobileChatList(staff, filter, url.searchParams.get("q") ?? undefined) });
});
