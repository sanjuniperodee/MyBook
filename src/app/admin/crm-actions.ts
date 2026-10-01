"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmCalls, crmConversations, crmDeals, orders, users } from "@/lib/db/schema";
import { assertStaff, assertVisible, audit, canAssignOthers, ForbiddenError } from "@/server/access";
import { clickToCall, TelephonyError } from "@/lib/crm/telephony";
import { getSetting } from "@/lib/crm/settings";
import { normalizePhone } from "@/lib/crm/phone";

type Target = { clientId?: string; dealId?: string; orderId?: string; callId?: string };

export type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; message: string };

const uuid = z.string().uuid();

/** Ответственный за клиента. «Только свои» может лишь взять неразобранного клиента себе. */
export async function setClientManagerAction(clientId: string, managerId: string | null): Promise<ActionResult> {
  const staff = await assertStaff("clients.edit");
  const client = await db.query.users.findFirst({ where: eq(users.id, uuid.parse(clientId)) });
  if (!client) return { ok: false, message: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  const next = managerId ? uuid.parse(managerId) : null;
  if (!canAssignOthers(staff) && next !== staff.user.id && !(next === null && client.managerId === staff.user.id)) throw new ForbiddenError();
  if (next) {
    const m = await db.query.users.findFirst({ where: eq(users.id, next), columns: { role: true, staffDisabled: true } });
    if (!m || m.role !== "admin" || m.staffDisabled) return { ok: false, message: "Сотрудник не найден" };
  }
  await db.update(users).set({ managerId: next }).where(eq(users.id, client.id));
  await audit(staff, "client.manager", "client", client.id, { from: client.managerId, to: next });
  revalidatePath(`/admin/clients/${client.id}`);
  revalidatePath("/admin/clients");
  return { ok: true };
}

/** Номер для звонка/чата берём на сервере: сотрудник без права видеть контакты всё равно может связаться. */
async function resolveContact(target: Target) {
  if (target.callId) {
    const c = await db.query.crmCalls.findFirst({ where: eq(crmCalls.id, uuid.parse(target.callId)) });
    return c ? { phone: c.clientPhone, email: null as string | null, clientId: c.clientId, assigneeId: c.staffId, name: "", dealId: c.dealId } : null;
  }
  if (target.dealId) {
    const d = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, uuid.parse(target.dealId)) });
    if (!d) return null;
    let phone = d.contactPhone;
    const client = d.clientId ? await db.query.users.findFirst({ where: eq(users.id, d.clientId), columns: { phone: true, email: true } }) : null;
    if (!phone) phone = client?.phone ?? null;
    return { phone, email: d.contactEmail ?? client?.email ?? null, clientId: d.clientId, assigneeId: d.assigneeId, name: d.contactName, dealId: d.id };
  }
  if (target.orderId) {
    const o = await db.query.orders.findFirst({ where: eq(orders.id, uuid.parse(target.orderId)) });
    return o ? { phone: o.contactPhone, email: o.contactEmail, clientId: o.userId, assigneeId: o.assigneeId, name: o.contactName, dealId: null } : null;
  }
  if (target.clientId) {
    const c = await db.query.users.findFirst({ where: eq(users.id, uuid.parse(target.clientId)) });
    if (!c) return null;
    let phone = c.phone;
    if (!phone) phone = (await db.query.orders.findFirst({ where: eq(orders.userId, c.id), columns: { contactPhone: true }, orderBy: (o, { desc }) => desc(o.createdAt) }))?.contactPhone ?? null;
    return { phone, email: c.email, clientId: c.id, assigneeId: c.managerId, name: c.name, dealId: null };
  }
  return null;
}

export async function callAction(target: Target): Promise<ActionResult> {
  const staff = await assertStaff("calls.make");
  const c = await resolveContact(target);
  if (!c?.phone || normalizePhone(c.phone).length < 10) return { ok: false, message: "У клиента нет номера телефона" };
  assertVisible(staff, c.assigneeId);
  try {
    await clickToCall(staff.user.sipExtension, normalizePhone(c.phone));
  } catch (err) {
    if (err instanceof TelephonyError) return { ok: false, message: err.message };
    throw err;
  }
  return { ok: true, message: "Сейчас зазвонит ваш телефон — возьмите трубку, и АТС соединит с клиентом" };
}

/** Открыть чат WhatsApp с клиентом (существующий или новый) — возвращает id диалога. */
export async function openChatAction(target: Target): Promise<ActionResult> {
  const staff = await assertStaff("chats.send");
  const c = await resolveContact(target);
  if (!c?.phone || normalizePhone(c.phone).length < 10) return { ok: false, message: "У клиента нет номера телефона" };
  assertVisible(staff, c.assigneeId);
  const channelId = await getSetting("wazzup.channelId");
  if (!channelId) return { ok: false, message: "Не выбран канал WhatsApp для исходящих — укажите его в разделе «Интеграции»" };
  const conv = await container().messaging.chats.conversationForPhone(c.phone, channelId, c.clientId, c.name ?? "");
  if (c.dealId && !conv.dealId) await db.update(crmConversations).set({ dealId: c.dealId }).where(eq(crmConversations.id, conv.id));
  return { ok: true, id: conv.id };
}

/** Письмо клиенту из карточки: адрес берём на сервере, письмо попадает в историю и единый инбокс. */
export async function sendEmailAction(target: Target, subject: string, text: string): Promise<ActionResult> {
  const staff = await assertStaff("chats.send");
  const c = await resolveContact(target);
  if (!c?.email) return { ok: false, message: "У клиента нет e-mail" };
  assertVisible(staff, c.assigneeId);
  const body = z.string().trim().min(1, "Напишите текст письма").max(20_000).parse(text);
  const { sendEmailToContact } = await import("@/lib/crm/email");
  const r = await sendEmailToContact({ to: c.email, subject: z.string().max(200).parse(subject), text: body, authorId: staff.user.id, dealId: c.dealId, clientId: c.clientId, contactName: c.name ?? "" });
  await audit(staff, "email.send", c.dealId ? "deal" : "client", c.dealId ?? c.clientId, { ok: r.ok });
  if (c.dealId) revalidatePath(`/admin/deals/${c.dealId}`);
  if (c.clientId) revalidatePath(`/admin/clients/${c.clientId}`);
  return r.ok ? { ok: true, message: "Письмо отправлено", id: r.conversationId } : { ok: false, message: r.error };
}

/** Пропущенный звонок обработан (перезвонили с мобильного, написали и т.п.). */
export async function markCallHandledAction(callId: string): Promise<ActionResult> {
  const staff = await assertStaff("calls.view");
  const call = await db.query.crmCalls.findFirst({ where: eq(crmCalls.id, uuid.parse(callId)) });
  if (!call) return { ok: false, message: "Звонок не найден" };
  assertVisible(staff, call.staffId);
  await db.update(crmCalls).set({ handledAt: new Date(), staffId: call.staffId ?? staff.user.id }).where(eq(crmCalls.id, call.id));
  revalidatePath("/admin/calls");
  return { ok: true };
}

/** Дополнительные телефоны клиента: по ним узнаём его в звонках и WhatsApp. */
export async function setClientPhonesAction(clientId: string, raw: string): Promise<ActionResult> {
  const staff = await assertStaff("clients.edit", "clients.contacts");
  const client = await db.query.users.findFirst({ where: eq(users.id, uuid.parse(clientId)) });
  if (!client) return { ok: false, message: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  const main = client.phone ? normalizePhone(client.phone) : "";
  const phones = [...new Set(raw.split(/[,;\n]/).map((p) => normalizePhone(p)).filter((p) => p.length >= 10 && p !== main))].slice(0, 5);
  await db.update(users).set({ extraPhones: phones }).where(eq(users.id, client.id));
  await audit(staff, "client.phones", "client", client.id, { count: phones.length });
  revalidatePath(`/admin/clients/${client.id}`);
  return { ok: true, message: phones.length ? `Сохранено номеров: ${phones.length}` : "Дополнительные номера удалены" };
}

/** «На смене» — получать новые заявки по кругу. */
export async function setShiftAction(onShift: boolean) {
  const staff = await assertStaff();
  await db.update(users).set({ onShift: !!onShift }).where(eq(users.id, staff.user.id));
  await audit(staff, onShift ? "staff.shift_on" : "staff.shift_off", "user", staff.user.id);
}

/** Свои поля клиента (раздел «Свои поля» → поля клиента). */
export async function setClientFieldsAction(_: { ok?: string; error?: string }, form: FormData): Promise<{ ok?: string; error?: string }> {
  const staff = await assertStaff("clients.edit");
  const client = await db.query.users.findFirst({ where: eq(users.id, uuid.parse(String(form.get("clientId") ?? ""))) });
  if (!client) return { error: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  const { listFields, readFieldValues } = await import("@/lib/crm/fields");
  await db.update(users).set({ customFields: readFieldValues(await listFields("client"), form, client.customFields) }).where(eq(users.id, client.id));
  revalidatePath(`/admin/clients/${client.id}`);
  return { ok: "Сохранено" };
}
