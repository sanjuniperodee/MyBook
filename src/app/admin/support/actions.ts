"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, audit, canSeeAssigned } from "@/server/access";
import { container } from "@/server/container";
import { SUPPORT_STATUSES } from "@/shared/domain/support";
import { SupportError } from "@/modules/support";
import { canOpenTicket } from "./access";

const updateInput = z.object({
  id: uuid,
  status: z.enum(SUPPORT_STATUSES),
  resolution: z.string().max(4000),
  devNote: z.string().max(10_000),
  notify: z.boolean(),
});

type Result = { ok: true; notified: boolean | null } | { ok: false; error: string };

const actorOf = (staff: Awaited<ReturnType<typeof assertStaff>>) => ({ userId: staff.user.id, name: staff.user.name || staff.user.email });

async function run(number: number, fn: () => Promise<boolean | null>): Promise<Result> {
  try {
    const notified = await fn();
    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${number}`);
    return { ok: true, notified };
  } catch (err) {
    if (SupportError.is(err)) return { ok: false, error: err.message };
    throw err;
  }
}

/** Статус, что сделали и заметка; notify — написать человеку в WhatsApp. */
export async function updateTicketAction(number: number, raw: z.input<typeof updateInput>): Promise<Result> {
  const staff = await assertStaff("settings.manage");
  const d = updateInput.parse(raw);
  return run(number, async () => {
    const r = await container().support.tickets.update(d.id, { status: d.status, resolution: d.resolution, devNote: d.devNote, notify: d.notify }, actorOf(staff));
    await audit(staff, "support.update", "support_ticket", d.id, { status: d.status, notify: d.notify });
    return r.notified;
  });
}

/** Написать человеку сейчас: номер обращения, статус и что сделали. */
export async function notifyTicketAction(number: number, id: string): Promise<Result> {
  const staff = await assertStaff("settings.manage");
  const ticketId = uuid.parse(id);
  return run(number, () => container().support.tickets.notify(ticketId, actorOf(staff)));
}

/** Расшифровать голосовые и пересобрать суть заново (например, после пополнения OpenRouter). */
export async function reprocessTicketAction(number: number, id: string): Promise<Result> {
  await assertStaff("settings.manage");
  const ticketId = uuid.parse(id);
  return run(number, async () => {
    await container().support.tickets.process(ticketId, { force: true });
    return null;
  });
}

export interface ChatHit {
  id: string;
  contact: string;
  chatId: string;
  channel: string;
  last: string;
  lastAt: string | null;
}

export interface ChatLine {
  id: string;
  at: string;
  direction: string;
  type: string;
  text: string;
  transcript: string | null;
}

/** Найти диалог для обращения: по телефону (цифры) или имени контакта. */
export async function searchChatsAction(q: string): Promise<ChatHit[]> {
  const staff = await assertStaff("chats.view");
  const rows = (await container().messaging.queries.findConversations(z.string().max(100).parse(q), 30)).filter((r) => canSeeAssigned(staff, r.assigneeId)).slice(0, 15);
  return rows.map((r) => ({ id: r.id, contact: r.contactName, chatId: r.chatId, channel: r.channel, last: r.lastMessageText.slice(0, 120), lastAt: r.lastMessageAt?.toISOString() ?? null }));
}

/** Сообщения диалога до before (старые сверху) — выбрать, какие относятся к обращению. */
export async function chatMessagesAction(conversationId: string, before?: string): Promise<ChatLine[]> {
  const staff = await assertStaff("chats.view");
  const id = uuid.parse(conversationId);
  const conv = await container().messaging.queries.conversation(id);
  if (!conv || !canSeeAssigned(staff, conv.assigneeId)) return [];
  const at = before ? new Date(z.string().datetime().parse(before)) : undefined;
  const rows = await container().messaging.queries.pickableMessages(id, { limit: 80, before: at });
  return rows.map((m) => ({ id: m.id, at: m.createdAt.toISOString(), direction: m.direction, type: m.type, text: m.text.slice(0, 1000), transcript: m.transcript }));
}

/** Приложить выбранные сообщения диалога к обращению (пустой список — отвязать) и сразу разобрать: расшифровка и суть. */
export async function linkChatAction(number: number, id: string, conversationId: string | null, messageIds: string[]): Promise<Result> {
  const staff = await assertStaff("chats.view");
  const ticketId = uuid.parse(id);
  const ticket = await container().support.tickets.byId(ticketId);
  if (!ticket || !canOpenTicket(staff, ticket)) return { ok: false, error: "Обращение не найдено" };
  const conv = conversationId ? uuid.parse(conversationId) : null;
  const ids = z.array(uuid).max(200).parse(messageIds);
  if (conv) {
    const c = await container().messaging.queries.conversation(conv);
    if (!c || !canSeeAssigned(staff, c.assigneeId)) return { ok: false, error: "Этот чат вам недоступен" };
  }
  return run(number, async () => {
    await container().support.tickets.linkChat(ticketId, conv, ids, actorOf(staff));
    if (conv && ids.length) await container().support.tickets.process(ticketId);
    await audit(staff, "support.link_chat", "support_ticket", ticketId, { conversationId: conv, messages: ids.length });
    return null;
  });
}
