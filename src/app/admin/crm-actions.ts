"use server";

import { GOWA_CHANNEL } from "@/modules/messaging/domain/gowa";
import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, assertVisible, assertWorkable, audit, canAssignOthers, ForbiddenError } from "@/server/access";
import { TelephonyError } from "@/modules/telephony";
import { ClientsError, type ContactTarget } from "@/modules/clients";
import { getSetting } from "@/modules/workspace";
import { formatPhone, normalizePhone } from "@/shared/domain/phone";
import { channelOf, channels, isManualChannel, manualAttribution, toAttribution } from "@/shared/domain/channels";

type Target = ContactTarget;

type ActionResult = { ok: true; message?: string; id?: string } | { ok: false; message: string };


/** Ответственный за клиента. «Только свои» может лишь взять неразобранного клиента себе. */
export async function setClientManagerAction(clientId: string, managerId: string | null): Promise<ActionResult> {
  const staff = await assertStaff("clients.edit");
  const client = await container().clients.clients.find(uuid.parse(clientId));
  if (!client) return { ok: false, message: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  const next = managerId ? uuid.parse(managerId) : null;
  if (!canAssignOthers(staff) && next !== staff.user.id && !(next === null && client.managerId === staff.user.id)) throw new ForbiddenError();
  try {
    await container().clients.clients.setManager(client, next);
  } catch (err) {
    if (ClientsError.is(err)) return { ok: false, message: err.message };
    throw err;
  }
  await audit(staff, "client.manager", "client", client.id, { from: client.managerId, to: next });
  revalidatePath(`/admin/clients/${client.id}`);
  revalidatePath("/admin/clients");
  return { ok: true };
}

/**
 * Канал привлечения клиента: менеджер указывает, откуда клиент пришёл (Instagram, звонок, рекомендация…).
 * Метка заменяет прежнюю (старая — в журнале действий) и переносится на сделки клиента без настоящих UTM-меток.
 */
export async function setClientChannelAction(clientId: string, channel: string): Promise<ActionResult> {
  const staff = await assertStaff("clients.edit");
  if (!isManualChannel(channel)) return { ok: false, message: "Выберите канал из списка" };
  const c = container();
  const client = await c.clients.clients.find(uuid.parse(clientId));
  if (!client) return { ok: false, message: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  const source = client.source;
  const before = channelOf(toAttribution(source));
  const next = manualAttribution(channel) as Record<string, string>;
  await c.clients.clients.setSource(client.id, next);
  await c.sales.setClientAttribution(client.id, next);
  await audit(staff, "client.channel", "client", client.id, { from: source ?? null, fromChannel: channels[before], to: channels[channel] });
  revalidatePath(`/admin/clients/${client.id}`);
  revalidatePath("/admin/clients");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/marketing");
  return { ok: true, message: `Канал: ${channels[channel]}` };
}

/**
 * Язык кабинета и писем клиента — если при заведении выбрали не тот. Ссылка входа и сообщение с доступом
 * («Доступ в кабинет») после смены — на новом языке; на сайте клиент может переключить язык и сам.
 */
export async function setClientLocaleAction(clientId: string, locale: string): Promise<ActionResult> {
  const staff = await assertStaff("clients.edit");
  const next = z.enum(["ru", "kk"]).safeParse(locale);
  if (!next.success) return { ok: false, message: "Выберите язык" };
  const c = container();
  const client = await c.clients.clients.find(uuid.parse(clientId));
  if (!client) return { ok: false, message: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  await c.identity.accounts.setLocale(client.id, next.data);
  await audit(staff, "client.locale", "client", client.id, { to: next.data });
  revalidatePath(`/admin/clients/${client.id}`);
  return { ok: true, message: next.data === "kk" ? "Язык: казахский" : "Язык: русский" };
}

/** Номер для звонка/чата берём на сервере: сотрудник без права видеть контакты всё равно может связаться. */
function resolveContact(target: Target) {
  const id = (v?: string) => (v ? uuid.parse(v) : undefined);
  return container().clients.contact({ callId: id(target.callId), dealId: id(target.dealId), orderId: id(target.orderId), clientId: id(target.clientId) });
}

export async function callAction(target: Target): Promise<ActionResult> {
  const staff = await assertStaff("calls.make");
  const c = await resolveContact(target);
  if (!c?.phone || normalizePhone(c.phone).length < 10) return { ok: false, message: "У клиента нет номера телефона" };
  assertWorkable(staff, c.assigneeId);
  try {
    await container().telephony.phone.clickToCall(staff.user.sipExtension, normalizePhone(c.phone));
  } catch (err) {
    if (TelephonyError.is(err)) return { ok: false, message: err.message };
    throw err;
  }
  return { ok: true, message: "Сейчас зазвонит ваш телефон — возьмите трубку, и АТС соединит с клиентом" };
}

/** Открыть чат WhatsApp с клиентом (существующий или новый) — возвращает id диалога. */
export async function openChatAction(target: Target): Promise<ActionResult> {
  const staff = await assertStaff("chats.send");
  const c = await resolveContact(target);
  if (!c?.phone || normalizePhone(c.phone).length < 10) return { ok: false, message: "У клиента нет номера телефона" };
  assertWorkable(staff, c.assigneeId);
  // Свой шлюз (GOWA) — один номер магазина; Wazzup — канал для исходящих из «Интеграций».
  const channelId = (await container().messaging.whatsappProvider()) === "gowa" ? GOWA_CHANNEL : await getSetting("wazzup.channelId");
  if (!channelId) return { ok: false, message: "Не выбран канал WhatsApp для исходящих — укажите его в разделе «Интеграции»" };
  const conv = await container().messaging.chats.conversationForPhone(c.phone, channelId, c.clientId, c.name ?? "");
  if (c.dealId && !conv.dealId) await container().messaging.chats.attachDeal(conv.id, c.dealId);
  return { ok: true, id: conv.id };
}

/** Письмо клиенту из карточки: адрес берём на сервере, письмо попадает в историю и единый инбокс. */
export async function sendEmailAction(target: Target, subject: string, text: string): Promise<ActionResult> {
  const staff = await assertStaff("chats.send");
  const c = await resolveContact(target);
  if (!c?.email) return { ok: false, message: "У клиента нет e-mail" };
  assertWorkable(staff, c.assigneeId);
  const body = z.string().trim().min(1, "Напишите текст письма").max(20_000).parse(text);
  const r = await container().messaging.email.sendToContact({ to: c.email, subject: z.string().max(200).parse(subject), text: body, authorId: staff.user.id, dealId: c.dealId, clientId: c.clientId, contactName: c.name ?? "" });
  await audit(staff, "email.send", c.dealId ? "deal" : "client", c.dealId ?? c.clientId, { ok: r.ok });
  if (c.dealId) revalidatePath(`/admin/deals/${c.dealId}`);
  if (c.clientId) revalidatePath(`/admin/clients/${c.clientId}`);
  return r.ok ? { ok: true, message: "Письмо отправлено", id: r.conversationId } : { ok: false, message: r.error };
}

/** Пропущенный звонок обработан (перезвонили с мобильного, написали и т.п.). */
export async function markCallHandledAction(callId: string): Promise<ActionResult> {
  const staff = await assertStaff("calls.view");
  const call = await container().telephony.queries.byId(uuid.parse(callId));
  if (!call) return { ok: false, message: "Звонок не найден" };
  assertVisible(staff, call.staffId);
  await container().telephony.calls.markHandled(call.id, staff.user.id);
  revalidatePath("/admin/calls");
  return { ok: true };
}

/** Дополнительные телефоны клиента: по ним узнаём его в звонках и WhatsApp. */
export async function setClientPhonesAction(clientId: string, raw: string): Promise<ActionResult> {
  const staff = await assertStaff("clients.edit", "clients.contacts");
  const client = await container().clients.clients.find(uuid.parse(clientId));
  if (!client) return { ok: false, message: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  const phones = await container().clients.clients.setExtraPhones(client, raw);
  await audit(staff, "client.phones", "client", client.id, { count: phones.length });
  revalidatePath(`/admin/clients/${client.id}`);
  return { ok: true, message: phones.length ? `Сохранено номеров: ${phones.length}` : "Дополнительные номера удалены" };
}

/** «На смене» — получать новые заявки по кругу. */
export async function setShiftAction(rawOnShift: boolean) {
  const staff = await assertStaff();
  const onShift = z.boolean().parse(rawOnShift);
  await container().access.shifts.set(staff.user.id, onShift);
  await audit(staff, onShift ? "staff.shift_on" : "staff.shift_off", "user", staff.user.id);
  // Вышел на смену — ждущие заявки (ночные, «никого не было») раздаются сразу, не дожидаясь прохода планировщика.
  if (onShift) void container().sales.routing.run().catch((err) => console.error("[routing] shift on", err));
}

/** Свои поля клиента (раздел «Свои поля» → поля клиента). */
export async function setClientFieldsAction(_: { ok?: string; error?: string }, form: FormData): Promise<{ ok?: string; error?: string }> {
  const staff = await assertStaff("clients.edit");
  const client = await container().clients.clients.find(uuid.parse(String(form.get("clientId") ?? "")));
  if (!client) return { error: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  const { listFields, readFieldValues } = await import("@/modules/workspace");
  await container().clients.clients.setCustomFields(client, readFieldValues(await listFields("client"), form, client.customFields));
  revalidatePath(`/admin/clients/${client.id}`);
  return { ok: "Сохранено" };
}

/**
 * Открыть номер и почту своего клиента (роль без «видеть контакты полностью»): каждое открытие — в журнале,
 * руководитель видит, кто, чей и когда открывал.
 */
export async function revealContactAction(target: Target): Promise<{ ok: true; phone: string; email: string } | { ok: false; message: string }> {
  const staff = await assertStaff("clients.reveal");
  const c = await resolveContact(target);
  if (!c) return { ok: false, message: "Контакт не найден" };
  assertWorkable(staff, c.assigneeId);
  await audit(staff, "client.contact_reveal", c.dealId ? "deal" : "client", c.dealId ?? c.clientId, { name: c.name ?? "" });
  return { ok: true, phone: c.phone ? formatPhone(c.phone) : "", email: c.email ?? "" };
}
