"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmConversations, users } from "@/lib/db/schema";
import { assertStaff, assertVisible, audit, can, canAssignOthers, ForbiddenError, type Staff } from "@/lib/crm/rbac";
import { addInternalNote, channelLabel, markConversationRead, sendChatMessage } from "@/lib/crm/chats";
import { buildOffer, type OfferRequest } from "@/lib/crm/offers";
import { notifyMentions } from "@/lib/crm/mentions";
import { addDealNote } from "@/lib/crm/deals";
import { adminLabel } from "@/lib/crm";
import { createDeal, sourceFromChannel } from "@/lib/crm/deals";
import { formatPhone, isPhoneLike, normalizePhone } from "@/lib/crm/phone";
import { notify } from "@/lib/crm/notify";

const uuid = z.string().uuid();

async function loadConv(staff: Staff, id: string) {
  const conv = await db.query.crmConversations.findFirst({ where: eq(crmConversations.id, uuid.parse(id)) });
  if (!conv) throw new Error("Диалог не найден");
  assertVisible(staff, conv.assigneeId);
  return conv;
}

export async function sendMessageAction(conversationId: string, text: string) {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadConv(staff, conversationId);
  const body = z.string().trim().min(1, "Пустое сообщение").max(4000).parse(text);
  const msg = await sendChatMessage(conv.id, body, staff.user.id);
  revalidatePath("/admin/chats");
  return { id: msg.id, status: msg.status, error: "error" in msg ? (msg.error ?? null) : null };
}

export async function markReadAction(conversationId: string) {
  const staff = await assertStaff("chats.view");
  const conv = await loadConv(staff, conversationId);
  if (conv.unread) await markConversationRead(conv.id);
}

export async function assignConversationAction(conversationId: string, userId: string | null) {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadConv(staff, conversationId);
  const next = userId ? uuid.parse(userId) : null;
  if (!canAssignOthers(staff) && next !== staff.user.id) throw new ForbiddenError();
  if (next) {
    const u = await db.query.users.findFirst({ where: eq(users.id, next), columns: { role: true, staffDisabled: true } });
    if (!u || u.role !== "admin" || u.staffDisabled) throw new Error("Сотрудник не найден");
    if (next !== staff.user.id)
      await notify([next], { kind: "message", title: `Вам передали чат: ${conv.contactName || formatPhone(conv.chatId) || conv.chatId}`, body: conv.lastMessageText, link: `/admin/chats?c=${conv.id}` });
  }
  await db.update(crmConversations).set({ assigneeId: next }).where(eq(crmConversations.id, conv.id));
  revalidatePath("/admin/chats");
}

/** Закрыть диалог (вопрос решён) — он уйдёт из «Открытых» и вернётся сам при новом сообщении клиента. */
export async function setConversationStatusAction(conversationId: string, status: "open" | "closed") {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadConv(staff, conversationId);
  await db
    .update(crmConversations)
    .set({ status: z.enum(["open", "closed"]).parse(status), ...(status === "closed" ? { awaitingSince: null, unread: 0 } : {}) })
    .where(eq(crmConversations.id, conv.id));
  revalidatePath("/admin/chats");
}

export async function createDealFromChatAction(conversationId: string) {
  const staff = await assertStaff("chats.view", "deals.edit");
  const conv = await loadConv(staff, conversationId);
  if (conv.dealId) return { id: conv.dealId };
  const phone = isPhoneLike(conv.chatId) ? normalizePhone(conv.chatId) : null;
  const deal = await createDeal({
    title: `Заявка из ${channelLabel(conv.channel)}${conv.contactName ? `: ${conv.contactName}` : ""}`,
    source: sourceFromChannel(conv.channel),
    clientId: conv.clientId,
    contactName: conv.contactName,
    contactPhone: phone,
    assigneeId: conv.assigneeId ?? staff.user.id,
    createdById: staff.user.id,
  });
  await db.update(crmConversations).set({ dealId: deal.id, assigneeId: conv.assigneeId ?? deal.assigneeId }).where(eq(crmConversations.id, conv.id));
  revalidatePath("/admin/chats");
  return { id: deal.id };
}

/** Внутренняя заметка в диалоге (клиент не видит); @упомянутые получают уведомление. */
export async function sendInternalNoteAction(conversationId: string, text: string) {
  const staff = await assertStaff("chats.view");
  const conv = await loadConv(staff, conversationId);
  const body = z.string().trim().min(1, "Пустая заметка").max(4000).parse(text);
  const msg = await addInternalNote(conv.id, body, staff.user.id);
  await notifyMentions(body, staff.user.id, adminLabel(staff.user), `/admin/chats?c=${conv.id}`, `чат с ${conv.contactName || "клиентом"}`);
  revalidatePath("/admin/chats");
  return { id: msg.id };
}

const offerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order") }),
  z.object({ kind: z.literal("book") }),
  z.object({ kind: z.literal("discount"), percent: z.number().int(), hours: z.number().int() }),
]);

/** Ссылка на оплату / на книгу / персональная скидка — одной кнопкой из чата. */
export async function sendOfferAction(conversationId: string, request: OfferRequest): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadConv(staff, conversationId);
  const req = offerSchema.parse(request);
  if (req.kind === "discount" && !can(staff, "promo.give")) throw new ForbiddenError();
  let offer: { text: string; promo?: string };
  try {
    offer = await buildOffer(conv, req, adminLabel(staff.user));
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  const msg = await sendChatMessage(conv.id, offer.text, staff.user.id);
  if (offer.promo) {
    await audit(staff, "promo.personal", "promo", offer.promo, { percent: req.kind === "discount" ? req.percent : null, conversation: conv.id });
    if (conv.dealId) await addDealNote({ id: conv.dealId, clientId: conv.clientId }, `Персональная скидка ${req.kind === "discount" ? req.percent : ""}%: промокод ${offer.promo}`, staff.user.id);
  }
  revalidatePath("/admin/chats");
  return msg.status === "error" ? { ok: false, message: ("error" in msg && msg.error) || "Не удалось отправить" } : { ok: true, message: offer.promo ? `Отправлено, промокод ${offer.promo}` : "Отправлено" };
}
