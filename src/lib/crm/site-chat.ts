import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { crmConversations, crmMessages, crmTasks } from "../db/schema";
import { ingestMessage } from "./chats";
import { addDealNote, createDeal, findClientByPhone, findOpenDeal, nextRoundRobin } from "./deals";
import { notifyOwnerOr } from "./notify";
import { formatPhone, normalizePhone } from "./phone";
import { getSettings } from "./settings";
import { publish } from "./realtime";
import { shopWhatsapp } from "./links";

/** Cookie посетителя для чата на сайте: в базе храним только хэш, сам токен знает лишь браузер. */
export const VISITOR_COOKIE = "mb_chat";

const chatIdOf = (token: string) => `v_${createHash("sha256").update(`site-chat:${token}`).digest("hex").slice(0, 32)}`;

export async function widgetConfig() {
  const s = await getSettings(["widget.enabled", "widget.chat"]);
  const enabled = s["widget.enabled"] !== "off";
  return { enabled, chat: enabled && s["widget.chat"] !== "off", whatsapp: enabled ? await shopWhatsapp() : "" };
}

async function conversationOf(token: string) {
  return db.query.crmConversations.findFirst({ where: and(eq(crmConversations.channel, "site"), eq(crmConversations.channelId, ""), eq(crmConversations.chatId, chatIdOf(token))) });
}

/** Сообщение посетителя: попадает в единый инбокс как диалог «Чат на сайте», со сделкой и уведомлением. */
export async function postSiteMessage(input: { token: string; text: string; name?: string; phone?: string; page?: string; userId?: string | null; userName?: string }) {
  const phone = input.phone ? normalizePhone(input.phone) : "";
  await ingestMessage(
    {
      externalId: `site:${randomUUID()}`,
      channelId: "",
      chatType: "site",
      chatId: chatIdOf(input.token),
      at: new Date(),
      isEcho: false,
      type: "text",
      text: input.text,
      mediaUrl: null,
      contactName: (input.name || input.userName || "").slice(0, 80),
      avatarUrl: null,
      status: null,
    },
    { clientId: input.userId ?? (phone.length >= 10 ? await findClientByPhone(phone) : null), meta: { ...(input.page ? { page: input.page.slice(0, 200) } : {}), ...(phone.length >= 10 ? { phone } : {}) } },
  );
}

/** Переписка для виджета: без внутренних заметок; author — только «менеджер», без имён сотрудников и служебных данных. */
export async function siteMessages(token: string, after?: Date) {
  const conv = await conversationOf(token);
  if (!conv) return [];
  const rows = await db
    .select({ id: crmMessages.id, direction: crmMessages.direction, text: crmMessages.text, at: crmMessages.createdAt })
    .from(crmMessages)
    .where(and(eq(crmMessages.conversationId, conv.id), eq(crmMessages.internal, false), after ? gt(crmMessages.createdAt, after) : undefined))
    .orderBy(asc(crmMessages.createdAt))
    .limit(200);
  return rows.map((r) => ({ id: r.id, mine: r.direction === "in", text: r.text, at: r.at.toISOString() }));
}

/**
 * «Перезвоните мне»: сделка (открытая по телефону или новая), задача «позвонить» через 15 минут
 * на ответственного и уведомление — чтобы заявка не потерялась.
 */
export async function requestCallback(input: { name: string; phone: string; comment?: string; page?: string; userId?: string | null }) {
  const phone = normalizePhone(input.phone);
  const clientId = input.userId ?? (await findClientByPhone(phone));
  const existing = await findOpenDeal({ clientId, phone });
  const deal =
    existing ??
    (await createDeal({
      title: `Перезвонить: ${input.name || formatPhone(phone)}`,
      source: "site",
      clientId,
      contactName: input.name,
      contactPhone: phone,
      unsorted: true,
    }));
  const assigneeId = deal.assigneeId ?? (await nextRoundRobin());
  const note = [`📞 Заявка на обратный звонок с сайта: ${input.name || "без имени"}, ${formatPhone(phone)}`, input.comment ? `Комментарий: ${input.comment}` : "", input.page ? `Страница: ${input.page}` : ""].filter(Boolean).join("\n");
  await addDealNote(deal, note, null);
  await db.insert(crmTasks).values({ title: `Перезвонить ${input.name || formatPhone(phone)} — заявка с сайта`, kind: "call", dueAt: new Date(Date.now() + 15 * 60_000), dealId: deal.id, clientId: deal.clientId, assigneeId });
  await notifyOwnerOr(assigneeId, "deals.view", { kind: "task", title: `Перезвонить: ${input.name || formatPhone(phone)}`, body: input.comment?.slice(0, 160) || "Заявка на обратный звонок с сайта", link: `/admin/deals/${deal.id}` });
  void publish({ type: "notify" });
  return deal.id;
}
