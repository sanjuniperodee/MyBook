"use server";

import { GOWA_CHANNEL } from "@/modules/messaging/domain/gowa";
import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, assertVisible, assertWorkable, audit, canAssignOthers, ForbiddenError, workRefusal } from "@/server/access";
import { TelephonyError } from "@/modules/telephony";
import { ClientsError, type ContactTarget } from "@/modules/clients";
import { getSetting } from "@/modules/workspace";
import { formatPhone, normalizePhone } from "@/shared/domain/phone";
import { findSensitive, MessageActionError, sensitiveWhat, type ContactsTarget } from "@/modules/messaging";
import { admin } from "@/i18n/admin";
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

/**
 * Звонок через АТС. Чужая или неразобранная запись у роли «только свои» — отказ ответом (workRefusal), а не исключением:
 * у кнопки («Мой день», карточки, «Звонки») всплывёт текст, а не экран ошибки вместо CRM. То же у чата и письма.
 */
export async function callAction(target: Target): Promise<ActionResult> {
  const staff = await assertStaff("calls.make");
  const c = await resolveContact(target);
  if (!c?.phone || normalizePhone(c.phone).length < 10) return { ok: false, message: "У клиента нет номера телефона" };
  const refusal = workRefusal(staff, c.assigneeId);
  if (refusal) return { ok: false, message: refusal };
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
  const refusal = workRefusal(staff, c.assigneeId);
  if (refusal) return { ok: false, message: refusal };
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
  const refusal = workRefusal(staff, c.assigneeId);
  if (refusal) return { ok: false, message: refusal };
  const body = z.string().trim().min(1, "Напишите текст письма").max(20_000).parse(text);
  const title = z.string().max(200).parse(subject);
  // Как в чате: чужой номер, карта или реквизиты клиенту не уходят (номер клиента и магазина — можно).
  const found = findSensitive(`${title}\n${body}`, [c.phone, await container().marketing.service.shopWhatsapp()]);
  if (found.length) return { ok: false, message: `В письме ${sensitiveWhat(found)}. Оплата — только через счёт или ссылку из CRM, контакты клиента — через CRM.` };
  const r = await container().messaging.email.sendToContact({ to: c.email, subject: title, text: body, authorId: staff.user.id, dealId: c.dealId, clientId: c.clientId, contactName: c.name ?? "" });
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

/** «Не писать первым» по всем номерам и диалогам карточки (или снять отметку); нет ни номера, ни переписки — текст сотруднику. */
async function markNoMarketing(target: ContactsTarget, on: boolean, byUserId: string, where: string) {
  try {
    return await container().messaging.chats.setNoMarketing(target, on, byUserId, where);
  } catch (err) {
    if (MessageActionError.is(err)) return null;
    throw err;
  }
}

const noMarketingDone = (on: boolean) => (on ? "Не пишем первыми: бот не напоминает, правила не пишут" : "Снова можно писать первыми");

/**
 * Клиент просил не писать первым (кнопка в карточке клиента): его номера и диалоги — в стоп-лист «Не писать первым».
 * Входящие и ответы как обычно; бот не напоминает о себе, правила автоматизаций не пишут.
 */
export async function setClientNoMarketingAction(clientId: string, on: boolean): Promise<ActionResult> {
  const staff = await assertStaff("clients.edit");
  const next = z.boolean().parse(on);
  const client = await container().reporting.clientById(uuid.parse(clientId));
  if (!client) return { ok: false, message: "Клиент не найден" };
  assertVisible(staff, client.managerId);
  const values = await markNoMarketing({ clientId: client.id, phones: [client.phone, ...client.extraPhones] }, next, staff.user.id, "Карточка клиента");
  if (!values) return { ok: false, message: admin.noMarketingNoContacts };
  await audit(staff, "client.no_marketing", "client", client.id, { on: next, numbers: values.length });
  revalidatePath(`/admin/clients/${client.id}`);
  return { ok: true, message: noMarketingDone(next) };
}

/** То же из карточки сделки: номера сделки, её диалоги и диалоги её клиента. */
export async function setDealNoMarketingAction(dealId: string, on: boolean): Promise<ActionResult> {
  const staff = await assertStaff("deals.edit");
  const next = z.boolean().parse(on);
  const deal = await container().sales.deals.findById(uuid.parse(dealId));
  if (!deal) return { ok: false, message: admin.dealNotFound };
  assertWorkable(staff, deal.assigneeId);
  const values = await markNoMarketing({ dealId: deal.id, clientId: deal.clientId, phones: [deal.contactPhone, ...deal.extraPhones] }, next, staff.user.id, `Сделка №${deal.number}`);
  if (!values) return { ok: false, message: admin.noMarketingNoContacts };
  await audit(staff, "deal.no_marketing", "deal", deal.id, { on: next, numbers: values.length });
  revalidatePath(`/admin/deals/${deal.id}`);
  if (deal.clientId) revalidatePath(`/admin/clients/${deal.clientId}`);
  return { ok: true, message: noMarketingDone(next) };
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
