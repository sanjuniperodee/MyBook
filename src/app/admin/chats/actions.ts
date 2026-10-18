"use server";

import { container } from "@/server/container";
import { sourceFromChannel } from "@/modules/sales";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, assertVisible, assertWorkable, audit, can, canAssignOthers, canWork, contactView, ForbiddenError, type Staff } from "@/server/access";
import { channelLabel, findSensitive, MessageActionError, sensitiveLabels } from "@/modules/messaging";
import type { OfferRequest } from "@/modules/marketing";
import { notifyMentions, staffNotifier } from "@/modules/workspace";
import { staffLabel } from "@/shared/domain/staff";
import { formatPhone, isPhoneLike, normalizePhone } from "@/shared/domain/phone";
import { notify } from "@/modules/workspace";


async function loadConv(staff: Staff, id: string) {
  const conv = await container().messaging.queries.conversation(uuid.parse(id));
  if (!conv) throw new Error("Диалог не найден");
  assertVisible(staff, conv.assigneeId);
  return conv;
}

/** Диалог, который сотрудник ведёт сам: свой или любой у роли «все записи». Ничей менеджер себе не берёт — его раздаёт круг. */
async function loadOwnConv(staff: Staff, id: string) {
  const conv = await loadConv(staff, id);
  assertWorkable(staff, conv.assigneeId);
  return conv;
}

/**
 * Сообщение клиенту. Чужой номер, карта, IBAN или ссылка на перевод Kaspi — не уходит: менеджеру объясняем, что оплата
 * только через счёт из CRM. Если это действительно нужно (например, номер курьера), override — причина: сообщение уходит,
 * руководителям — уведомление, в журнал — chat.sensitive.
 */
export async function sendMessageAction(conversationId: string, text: string, override?: string, replyToId?: string | null): Promise<{ id: string; status: string; error: string | null } | { blocked: string }> {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadOwnConv(staff, conversationId);
  const body = z.string().trim().min(1, "Пустое сообщение").max(4000).parse(text);
  const deal = conv.dealId ? await container().sales.deals.findById(conv.dealId) : null;
  const findings = findSensitive(body, [conv.chatId, conv.meta.phone, deal?.contactPhone, ...(deal?.extraPhones ?? []), await container().marketing.service.shopWhatsapp()]);
  const reason = override?.trim().slice(0, 200) ?? "";
  if (findings.length && !reason) {
    const what = [...new Set(findings.map((f) => sensitiveLabels[f.kind]))].join(", ");
    return { blocked: `В сообщении ${what}. Оплата — только через счёт или ссылку из CRM, контакты клиента — через CRM.` };
  }
  const reply = replyToId ? uuid.parse(replyToId) : null;
  const msg = await container().messaging.chats.send(conv.id, body, staff.user.id, undefined, { replyToId: reply });
  if (findings.length) {
    await audit(staff, "chat.sensitive", "conversation", conv.id, { findings, reason, deal: deal?.number ?? null });
    await staffNotifier.notifyAllWith("team.manage", {
      kind: "system",
      title: `В чат ушли ${[...new Set(findings.map((f) => sensitiveLabels[f.kind]))].join(", ")}`,
      body: `${staffLabel(staff.user)} → ${conv.contactName || "клиент"}: ${findings.map((f) => f.value).join(", ")}. Причина: ${reason}`,
      link: `/admin/chats?c=${conv.id}`,
    });
  }
  revalidatePath("/admin/chats");
  return { id: msg.id, status: msg.status, error: "error" in msg ? (msg.error ?? null) : null };
}

export async function markReadAction(conversationId: string) {
  const staff = await assertStaff("chats.view");
  const conv = await loadConv(staff, conversationId);
  // Ничей диалог менеджер только смотрит: «прочитано» за ответственного не ставит.
  if (conv.unread && canWork(staff, conv.assigneeId)) await container().messaging.chats.markRead(conv.id);
}

export async function assignConversationAction(conversationId: string, userId: string | null) {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadOwnConv(staff, conversationId);
  const next = userId ? uuid.parse(userId) : null;
  if (!canAssignOthers(staff) && next !== staff.user.id) throw new ForbiddenError();
  if (next) {
    if (!(await container().access.queries.activeStaff(next))) throw new Error("Сотрудник не найден");
    if (next !== staff.user.id)
      await notify([next], { kind: "message", title: `Вам передали чат: ${conv.contactName || formatPhone(conv.chatId) || conv.chatId}`, body: conv.lastMessageText, link: `/admin/chats?c=${conv.id}` });
  }
  await container().messaging.chats.assign(conv.id, next);
  if (next !== conv.assigneeId) await audit(staff, "chat.assign", "conversation", conv.id, { from: conv.assigneeId, to: next });
  revalidatePath("/admin/chats");
}

/** Закрыть диалог (вопрос решён) — он уйдёт из «Открытых» и вернётся сам при новом сообщении клиента. */
export async function setConversationStatusAction(conversationId: string, status: "open" | "closed") {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadOwnConv(staff, conversationId);
  const next = z.enum(["open", "closed"]).parse(status);
  await container().messaging.chats.setStatus(conv.id, next);
  await audit(staff, next === "closed" ? "chat.close" : "chat.reopen", "conversation", conv.id, { contact: conv.contactName || conv.chatId });
  revalidatePath("/admin/chats");
}

/** «Остановить бота»: бот больше не пишет в этот диалог (менеджер ведёт сам). */
export async function stopBotAction(conversationId: string) {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadOwnConv(staff, conversationId);
  if (await container().messaging.bot.stopByHuman(conv.id, "button")) await audit(staff, "chat.bot_stop", "conversation", conv.id, { contact: conv.contactName || conv.chatId });
  revalidatePath("/admin/chats");
}

/** «Запустить бота» в диалоге, где он не работал или уже закончил: поздоровается и спросит недостающее. */
export async function startBotAction(conversationId: string) {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadOwnConv(staff, conversationId);
  await container().messaging.bot.startManually(conv.id);
  await audit(staff, "chat.bot_start", "conversation", conv.id, { contact: conv.contactName || conv.chatId });
  revalidatePath("/admin/chats");
}

export async function createDealFromChatAction(conversationId: string) {
  const staff = await assertStaff("chats.view", "deals.edit");
  const conv = await loadOwnConv(staff, conversationId);
  if (conv.dealId) return { id: conv.dealId };
  const phone = isPhoneLike(conv.chatId) ? normalizePhone(conv.chatId) : null;
  const deal = await container().sales.deals.create({
    title: `Заявка из ${channelLabel(conv.channel)}${conv.contactName ? `: ${conv.contactName}` : ""}`,
    source: sourceFromChannel(conv.channel),
    clientId: conv.clientId,
    contactName: conv.contactName,
    contactPhone: phone,
    assigneeId: conv.assigneeId ?? staff.user.id,
    createdById: staff.user.id,
  });
  await container().messaging.chats.linkCreatedDeal(conv.id, deal);
  revalidatePath("/admin/chats");
  return { id: deal.id };
}

/** Внутренняя заметка в диалоге (клиент не видит); @упомянутые получают уведомление. */
export async function sendInternalNoteAction(conversationId: string, text: string) {
  const staff = await assertStaff("chats.view");
  const conv = await loadConv(staff, conversationId);
  const body = z.string().trim().min(1, "Пустая заметка").max(4000).parse(text);
  const msg = await container().messaging.chats.addInternalNote(conv.id, body, staff.user.id);
  await notifyMentions(body, staff.user.id, staffLabel(staff.user), `/admin/chats?c=${conv.id}`, `чат с ${conv.contactName || "клиентом"}`);
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
  const conv = await loadOwnConv(staff, conversationId);
  const req = offerSchema.parse(request);
  if (req.kind === "discount" && !can(staff, "promo.give")) throw new ForbiddenError();
  let offer: { text: string; promo?: string };
  try {
    offer = await container().marketing.service.buildOffer(conv.clientId, req, staffLabel(staff.user));
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  const msg = await container().messaging.chats.send(conv.id, offer.text, staff.user.id);
  if (offer.promo) {
    await audit(staff, "promo.personal", "promo", offer.promo, { percent: req.kind === "discount" ? req.percent : null, conversation: conv.id });
    if (conv.dealId) await container().sales.deals.note({ id: conv.dealId, clientId: conv.clientId }, `Персональная скидка ${req.kind === "discount" ? req.percent : ""}%: промокод ${offer.promo}`, staff.user.id);
  }
  revalidatePath("/admin/chats");
  return msg.status === "error" ? { ok: false, message: ("error" in msg && msg.error) || "Не удалось отправить" } : { ok: true, message: offer.promo ? `Отправлено, промокод ${offer.promo}` : "Отправлено" };
}

// ─── действия с сообщениями: ответ, правка, удаление, пересылка, расшифровка ─────────────────

/** Ошибка, понятная сотруднику (окно правки, чужое сообщение, канал не умеет) — текстом, а не исключением. */
async function messageAction<T>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (err) {
    if (MessageActionError.is(err)) return { error: err.message };
    throw err;
  }
}

/** Изменить своё сообщение (у клиента тоже — в первые 15 минут) или свою заметку. */
export async function editMessageAction(conversationId: string, messageId: string, text: string): Promise<{ ok?: true; error?: string }> {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadOwnConv(staff, conversationId);
  const body = z.string().trim().min(1, "Пустое сообщение").max(4000).parse(text);
  if (findSensitive(body, [conv.chatId, conv.meta.phone]).length) return { error: "В тексте номер, карта или реквизиты — так менять нельзя" };
  const r = await messageAction(() => container().messaging.chats.editMessage(conv.id, uuid.parse(messageId), body, staff.user.id));
  revalidatePath("/admin/chats");
  return r && typeof r === "object" && "error" in r ? r : { ok: true };
}

/** Удалить своё сообщение (у клиента — «удалить для всех») или свою заметку. */
export async function deleteMessageAction(conversationId: string, messageId: string): Promise<{ ok?: true; error?: string }> {
  const staff = await assertStaff("chats.view", "chats.send");
  const conv = await loadOwnConv(staff, conversationId);
  const r = await messageAction(() => container().messaging.chats.deleteMessage(conv.id, uuid.parse(messageId), staff.user.id));
  if (!(r && typeof r === "object" && "error" in r)) await audit(staff, "chat.message.delete", "conversation", conv.id, { messageId });
  revalidatePath("/admin/chats");
  return r && typeof r === "object" && "error" in r ? r : { ok: true };
}

/** Куда переслать: диалоги, которые сотрудник ведёт (поиск по имени и номеру). */
export async function forwardTargetsAction(query: string): Promise<{ id: string; title: string; channel: string; last: string }[]> {
  const staff = await assertStaff("chats.view", "chats.send");
  const q = z.string().max(100).parse(query ?? "").trim();
  const list = await container().reporting.inbox({ userId: staff.user.id, seesAll: staff.scope === "all" }, "open", q || undefined);
  return list
    .filter((c) => canWork(staff, c.assigneeId))
    .slice(0, 40)
    .map((c) => ({
      id: c.id,
      title: c.contactName || (/^\d{10,15}$/.test(c.chatId) ? contactView(staff, { phone: formatPhone(c.chatId) }).phone || "клиент" : c.chatId),
      channel: channelLabel(c.channel),
      last: c.lastMessageText.slice(0, 80),
    }));
}

/** Переслать сообщение в другие диалоги (до 10), которые сотрудник ведёт сам. */
export async function forwardMessageAction(fromConversationId: string, messageId: string, targetIds: string[]): Promise<{ sent?: number; failed?: { title: string; error: string }[]; error?: string }> {
  const staff = await assertStaff("chats.view", "chats.send");
  const from = await loadConv(staff, fromConversationId);
  const ids = z.array(uuid).min(1, "Выберите, куда переслать").max(10, "Не больше 10 диалогов за раз").parse(targetIds);
  const targets = await Promise.all(ids.map((id) => loadOwnConv(staff, id)));
  const msg = await container().messaging.queries.messageConversation(uuid.parse(messageId));
  if (msg !== from.id) return { error: "Сообщение не найдено" };
  const r = await messageAction(() => container().messaging.forward(messageId, targets.map((t) => t.id), staff.user.id));
  if ("error" in r) return r;
  await audit(staff, "chat.forward", "conversation", from.id, { messageId, to: targets.map((t) => t.id) });
  revalidatePath("/admin/chats");
  const title = new Map(targets.map((t) => [t.id, t.contactName || formatPhone(t.chatId) || t.chatId]));
  return { sent: r.sent, failed: r.failed.map((f) => ({ title: title.get(f.conversationId) ?? "диалог", error: f.error })) };
}

/** Расшифровать голосовое моделью «Голосовые и фото». */
export async function transcribeMessageAction(conversationId: string, messageId: string): Promise<{ text?: string; error?: string }> {
  const staff = await assertStaff("chats.view");
  const conv = await loadConv(staff, conversationId);
  const owner = await container().messaging.queries.messageConversation(uuid.parse(messageId));
  if (owner !== conv.id) return { error: "Сообщение не найдено" };
  const r = await messageAction(() => container().messaging.transcribe(messageId));
  return typeof r === "string" ? { text: r } : r;
}

/**
 * У кого сейчас телефон WhatsApp магазина: его ответы с телефона забирают новые заявки на него. Назначить любого —
 * руководитель (назначает других), себе — любой, кто отвечает в чатах; null — не указано.
 */
export async function setPhoneHolderAction(userId: string | null): Promise<{ ok?: true; error?: string }> {
  const staff = await assertStaff("chats.view", "chats.send");
  const id = userId ? uuid.parse(userId) : null;
  if (id && id !== staff.user.id && !canAssignOthers(staff)) throw new ForbiddenError();
  if (!id && !canAssignOthers(staff)) throw new ForbiddenError();
  let name = "";
  if (id) {
    const person = await container().access.queries.activeStaff(id);
    if (!person) return { error: "Сотрудник не найден" };
    name = staffLabel(person);
  }
  await container().messaging.setPhoneHolder(id ? { id, name } : null, staff.user.id);
  await audit(staff, "settings.update", "settings", "whatsapp.phoneHolder", { to: id });
  revalidatePath("/admin/chats");
  return { ok: true };
}
