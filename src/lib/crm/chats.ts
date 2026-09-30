import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { crmConversations, crmMessages, users, type CrmConversation } from "../db/schema";
import { runTrigger } from "./automations";
import { createDeal, findClientByPhone, findOpenDeal, sourceFromChannel } from "./deals";
import { notifyOwnerOr } from "./notify";
import { isPhoneLike, normalizePhone, formatPhone } from "./phone";
import { sendWazzupMessage, WazzupError } from "./wazzup";
import { statusRank, type WazzupIncoming, type WazzupStatus } from "./wazzup-protocol";

export const channelLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  wapi: "WhatsApp API",
  instagram: "Instagram",
  telegram: "Telegram",
  tgapi: "Telegram",
  vk: "ВКонтакте",
  avito: "Avito",
  viber: "Viber",
};
export const channelLabel = (c: string) => channelLabels[c] ?? c;

const preview = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 160);

/**
 * Диалог по собеседнику. Новый диалог сразу связываем с клиентом (по телефону) и сделкой:
 * открытой — если есть, иначе создаём «Новую заявку», и её подхватывают правила распределения.
 */
async function upsertConversation(m: WazzupIncoming): Promise<{ conv: CrmConversation; created: boolean }> {
  const existing = await db.query.crmConversations.findFirst({
    where: and(eq(crmConversations.channel, m.chatType), eq(crmConversations.channelId, m.channelId), eq(crmConversations.chatId, m.chatId)),
  });
  if (existing) {
    if ((m.contactName && m.contactName !== existing.contactName && !m.isEcho) || (m.avatarUrl && m.avatarUrl !== existing.avatarUrl)) {
      await db
        .update(crmConversations)
        .set({ contactName: m.isEcho ? existing.contactName : m.contactName || existing.contactName, avatarUrl: m.avatarUrl ?? existing.avatarUrl })
        .where(eq(crmConversations.id, existing.id));
    }
    return { conv: existing, created: false };
  }
  const phone = isPhoneLike(m.chatId) ? normalizePhone(m.chatId) : null;
  const clientId = phone ? await findClientByPhone(phone) : null;
  const [conv] = await db
    .insert(crmConversations)
    .values({ channel: m.chatType, channelId: m.channelId, chatId: m.chatId, contactName: m.isEcho ? "" : m.contactName, avatarUrl: m.avatarUrl, clientId })
    .onConflictDoNothing()
    .returning();
  if (!conv) {
    // Параллельный вебхук успел создать диалог.
    const again = await db.query.crmConversations.findFirst({
      where: and(eq(crmConversations.channel, m.chatType), eq(crmConversations.channelId, m.channelId), eq(crmConversations.chatId, m.chatId)),
    });
    return { conv: again!, created: false };
  }
  return { conv, created: true };
}

/** Сделка для диалога: открытая по клиенту/телефону или новая заявка. */
async function ensureDeal(conv: CrmConversation, contactName: string): Promise<CrmConversation> {
  if (conv.dealId) return conv;
  const phone = isPhoneLike(conv.chatId) ? normalizePhone(conv.chatId) : null;
  const deal =
    (await findOpenDeal({ clientId: conv.clientId, phone })) ??
    (await createDeal({
      title: `Заявка из ${channelLabel(conv.channel)}${contactName ? `: ${contactName}` : phone ? `: ${formatPhone(phone)}` : ""}`,
      source: sourceFromChannel(conv.channel),
      clientId: conv.clientId,
      contactName: contactName || (conv.clientId ? "" : phone ? formatPhone(phone) : conv.chatId),
      contactPhone: phone,
    }));
  const assigneeId = conv.assigneeId ?? deal.assigneeId;
  const [updated] = await db
    .update(crmConversations)
    .set({ dealId: deal.id, clientId: conv.clientId ?? deal.clientId, assigneeId })
    .where(eq(crmConversations.id, conv.id))
    .returning();
  return updated;
}

export async function ingestMessage(m: WazzupIncoming) {
  const { conv: base } = await upsertConversation(m);
  if (m.isEcho) {
    // Эхо нашего же сообщения из CRM: externalId уже записан при отправке (или запишется) — не дублируем.
    const dup = await db.query.crmMessages.findFirst({ where: eq(crmMessages.externalId, m.externalId), columns: { id: true } });
    if (dup) return;
    const pending = await db.query.crmMessages.findFirst({
      where: and(eq(crmMessages.conversationId, base.id), eq(crmMessages.direction, "out"), isNull(crmMessages.externalId), eq(crmMessages.text, m.text), gte(crmMessages.createdAt, new Date(Date.now() - 120_000))),
    });
    if (pending) {
      await db.update(crmMessages).set({ externalId: m.externalId }).where(eq(crmMessages.id, pending.id));
      return;
    }
    const inserted = await db
      .insert(crmMessages)
      .values({ conversationId: base.id, direction: "out", type: m.type, text: m.text, mediaUrl: m.mediaUrl, externalId: m.externalId, status: "sent", createdAt: m.at })
      .onConflictDoNothing()
      .returning({ id: crmMessages.id });
    if (!inserted.length) return;
    // Менеджер ответил с телефона — клиент больше не ждёт.
    await db.update(crmConversations).set({ lastMessageAt: m.at, lastMessageText: preview(m.text), awaitingSince: null, unread: 0, updatedAt: new Date() }).where(eq(crmConversations.id, base.id));
    return;
  }

  const inserted = await db
    .insert(crmMessages)
    .values({ conversationId: base.id, direction: "in", type: m.type, text: m.text, mediaUrl: m.mediaUrl, externalId: m.externalId, status: "received", createdAt: m.at })
    .onConflictDoNothing()
    .returning({ id: crmMessages.id });
  if (!inserted.length) return; // повторная доставка вебхука

  const conv = await ensureDeal(base, m.contactName);
  await db
    .update(crmConversations)
    .set({
      lastMessageAt: m.at,
      lastMessageText: preview(m.text),
      unread: sql`${crmConversations.unread} + 1`,
      awaitingSince: sql`coalesce(${crmConversations.awaitingSince}, ${m.at.toISOString()}::timestamptz)`,
      status: "open",
      updatedAt: new Date(),
    })
    .where(eq(crmConversations.id, conv.id));
  await notifyOwnerOr(conv.assigneeId, "chats.view", {
    kind: "message",
    title: `${conv.contactName || m.contactName || formatPhone(conv.chatId) || conv.chatId} · ${channelLabel(conv.channel)}`,
    body: preview(m.text),
    link: `/admin/chats?c=${conv.id}`,
  });
  const day = m.at.toISOString().slice(0, 10);
  await runTrigger("message.incoming", { subject: `${conv.id}:${day}`, conversationId: conv.id, dealId: conv.dealId, clientId: conv.clientId, channel: conv.channel });
}

export async function applyStatus(s: WazzupStatus) {
  const msg = await db.query.crmMessages.findFirst({ where: eq(crmMessages.externalId, s.externalId), columns: { id: true, status: true } });
  if (!msg) return;
  if (s.status !== "error" && (statusRank[s.status] ?? 0) <= (statusRank[msg.status] ?? 0)) return;
  await db
    .update(crmMessages)
    .set({ status: s.status, error: s.error })
    .where(eq(crmMessages.id, msg.id));
}

/** Отправка из CRM (менеджером или автоматизацией — authorId = null). */
export async function sendChatMessage(conversationId: string, text: string, authorId: string | null) {
  const conv = await db.query.crmConversations.findFirst({ where: eq(crmConversations.id, conversationId) });
  if (!conv) throw new Error("Диалог не найден");
  const body = text.trim().slice(0, 4000);
  if (!body) throw new Error("Пустое сообщение");
  const [msg] = await db.insert(crmMessages).values({ conversationId, direction: "out", authorId, text: body, status: "pending" }).returning();
  const now = new Date();
  await db
    .update(crmConversations)
    .set({
      lastMessageAt: now,
      lastMessageText: preview(body),
      unread: 0,
      awaitingSince: null,
      // Кто первым ответил в неразобранном диалоге — тот и ответственный.
      assigneeId: conv.assigneeId ?? authorId,
      updatedAt: now,
    })
    .where(eq(crmConversations.id, conversationId));
  try {
    const externalId = await sendWazzupMessage({ channelId: conv.channelId, chatType: conv.channel, chatId: conv.chatId, text: body, crmMessageId: msg.id });
    await attachExternalId(msg.id, externalId);
    return { ...msg, externalId, status: "sent" as const };
  } catch (err) {
    const error = err instanceof WazzupError ? err.message : "Не удалось отправить";
    if (!(err instanceof WazzupError)) console.error("[chats] send", err);
    await db.update(crmMessages).set({ status: "error", error }).where(eq(crmMessages.id, msg.id));
    return { ...msg, status: "error" as const, error };
  }
}

/** Эхо-вебхук мог прийти раньше ответа API и создать копию — оставляем исходное сообщение. */
async function attachExternalId(id: string, externalId: string | null) {
  if (!externalId) {
    await db.update(crmMessages).set({ status: "sent" }).where(eq(crmMessages.id, id));
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(crmMessages).where(and(eq(crmMessages.externalId, externalId), sql`${crmMessages.id} <> ${id}`));
    await tx.update(crmMessages).set({ externalId, status: sql`case when ${crmMessages.status} = 'pending' then 'sent' else ${crmMessages.status} end` }).where(eq(crmMessages.id, id));
  });
}

export async function markConversationRead(conversationId: string) {
  await db.update(crmConversations).set({ unread: 0 }).where(eq(crmConversations.id, conversationId));
}

/** Диалог с клиентом по телефону (для кнопки «Написать» в карточке): существующий WhatsApp или новый. */
export async function conversationForPhone(phone: string, channelId: string, clientId: string | null, contactName: string) {
  const chatId = normalizePhone(phone);
  if (chatId.length < 10) throw new Error("Некорректный номер телефона");
  const [existing] = await db
    .select()
    .from(crmConversations)
    .where(and(eq(crmConversations.chatId, chatId), sql`${crmConversations.channel} in ('whatsapp', 'wapi')`))
    .orderBy(desc(crmConversations.lastMessageAt))
    .limit(1);
  if (existing) return existing;
  const [conv] = await db
    .insert(crmConversations)
    .values({ channel: "whatsapp", channelId, chatId, clientId, contactName, status: "open" })
    .onConflictDoNothing()
    .returning();
  return conv ?? (await db.query.crmConversations.findFirst({ where: and(eq(crmConversations.channel, "whatsapp"), eq(crmConversations.channelId, channelId), eq(crmConversations.chatId, chatId)) }))!;
}

export async function staffName(id: string | null) {
  if (!id) return null;
  return (await db.query.users.findFirst({ where: eq(users.id, id), columns: { name: true, email: true } })) ?? null;
}
