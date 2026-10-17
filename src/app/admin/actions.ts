"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, assertVisible, audit, can, ForbiddenError, type Staff } from "@/server/access";
import { normalizePromoCode, OrderingError } from "@/modules/ordering";
import { ORDER_STATUSES as orderStatuses } from "@/shared/domain/orders";
import { ClientsError, type Actor as CrmActor } from "@/modules/clients";
import type { Actor } from "@/shared/application";
import { container } from "@/server/container";
import { staffActionError } from "@/server/errors";
import { REMINDER_COOLDOWN_DAYS, type ReminderResult } from "@/modules/notifications";

export interface AdminState {
  error?: string;
  ok?: string;
}

const actor = (email: string) => `admin:${email}`;

async function guardDeal(staff: Staff, dealId: string) {
  if (staff.scope === "all") return;
  assertVisible(staff, await container().clients.links.dealAssignee(dealId));
}

/** Клиент чужого менеджера для роли «только свои» недоступен и в действиях. */
async function guardClient(staff: Staff, clientId: string) {
  if (staff.scope === "all") return;
  assertVisible(staff, (await container().clients.clients.find(clientId))?.managerId);
}

/** Сотрудник глазами контекста «Клиенты CRM». */
const crmActor = (staff: Staff): CrmActor => ({ userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all") });

/** Запрет из правил контекста — как ForbiddenError веб-слоя. */
async function clientsCommand<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (ClientsError.is(err) && err.code === "forbidden") throw new ForbiddenError();
    throw err;
  }
}

/** Подпись сотрудника в журналах заказа. */
const staffActor = (staff: Staff): Actor => ({ label: actor(staff.user.email), userId: staff.user.id });

/** Ошибку домена показываем сотруднику текстом, остальное — как есть. */
async function orderCommand(run: () => Promise<unknown>): Promise<AdminState | null> {
  try {
    await run();
    return null;
  } catch (err) {
    const error = staffActionError(err, OrderingError);
    if (error === null) throw err;
    return { error };
  }
}

export async function updateOrderAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const parsed = z
    .object({
      orderId: z.string("Заказ не найден").uuid("Заказ не найден"),
      status: z.enum(orderStatuses, "Выберите статус заказа"),
      trackingNumber: z.string().trim().max(100, "Номер отслеживания — до 100 символов").optional(),
      note: z.string().trim().max(1000, "Заметка — до 1000 символов").optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { orderId, status, trackingNumber, note } = parsed.data;
  const failed = await orderCommand(() => container().ordering.orders.update({ orderId, status, trackingNumber, note }, staffActor(staff)));
  if (failed) return failed;
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Сохранено" };
}

export async function saveAdminNoteAction(_: AdminState, form: FormData): Promise<AdminState> {
  await assertStaff("orders.edit");
  const orderId = uuid.parse(form.get("orderId"));
  await container().ordering.orders.saveAdminNote(orderId, String(form.get("adminNote") ?? ""));
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Заметка сохранена" };
}

export async function generateFilesAction(orderId: string) {
  const staff = await assertStaff("orders.files");
  await container().ordering.orders.regeneratePrintFiles(uuid.parse(orderId), staffActor(staff));
  revalidatePath(`/admin/orders/${orderId}`);
}

/** Временно открыть книгу для правок клиентом (например, по просьбе исправить опечатку). */
export async function toggleBookLockAction(orderId: string) {
  const staff = await assertStaff("orders.edit");
  await container().ordering.orders.toggleBookEditing(uuid.parse(orderId), staffActor(staff));
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function createPromoAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("promo.manage");
  const parsed = z
    .object({
      code: z.string().transform(normalizePromoCode).pipe(z.string().regex(/^[A-Z0-9_-]{3,40}$/, "Код: 3–40 символов, латиница, цифры, - и _")),
      kind: z.enum(["percent", "fixed"]),
      value: z.coerce.number().int().positive("Укажите размер скидки"),
      maxUses: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().positive().optional()),
      expiresAt: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.date().optional()),
      note: z.string().trim().max(200).optional(),
    })
    .refine((d) => d.kind !== "percent" || d.value <= 100, "Процент — не больше 100")
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const failed = await orderCommand(() => container().ordering.promos.create({ code: d.code, kind: d.kind, value: d.value, maxUses: d.maxUses ?? null, expiresOn: d.expiresAt ?? null, note: d.note ?? "" }));
  if (failed) return failed;
  await audit(staff, "promo.create", "promo", d.code, { kind: d.kind, value: d.value });
  revalidatePath("/admin/promo");
  return { ok: `Промокод ${d.code} создан` };
}

export async function togglePromoAction(id: string) {
  const staff = await assertStaff("promo.manage");
  const promo = await container().ordering.promos.toggle(uuid.parse(id));
  await audit(staff, promo.active ? "promo.enable" : "promo.disable", "promo", promo.code);
  revalidatePath("/admin/promo");
}

// ─── CRM: заказы ────────────────────────────────────────────────────────────

/** Перемещение карточки на канбан-доске. */
/** Перенос заказа на доске. Нарушение правила (неоплаченный — в печать) — текст ошибки, а не исключение. */
export async function moveOrderAction(orderId: string, status: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const failed = await orderCommand(() => container().ordering.orders.changeStatus({ orderId: uuid.parse(orderId), to: z.enum(orderStatuses).parse(status) }, staffActor(staff)));
  if (failed) return failed;
  revalidatePath("/admin/board");
  revalidatePath("/admin");
  return {};
}

/** Постоплата: неоплаченный заказ — в печать (договорились, что клиент заплатит после); причина обязательна. */
export async function startPostpayAction(orderId: string, reason: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const why = z.string().trim().min(3, "Укажите, о чём договорились с клиентом").max(200).safeParse(reason);
  if (!why.success) return { error: why.error.issues[0].message };
  const id = uuid.parse(orderId);
  const failed = await orderCommand(() => container().ordering.payments.startPostpay(id, why.data, staffActor(staff)));
  if (failed) return failed;
  await audit(staff, "order.postpay", "order", id, { reason: why.data });
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/board");
  return { ok: "Заказ в печати с постоплатой" };
}

/** Руководитель сверил ручную оплату заказа с поступлением на счёт. */
export async function reviewOrderPaymentAction(paymentId: string): Promise<AdminState> {
  const staff = await assertStaff("orders.edit", "team.manage");
  const p = await container().ordering.payments.review(uuid.parse(paymentId), staff.user.id);
  if (!p) return { error: "Оплата не найдена или уже проверена" };
  await audit(staff, "order.payment_review", "order", p.orderId, { payment: p.id, amount: p.amount });
  revalidatePath(`/admin/orders/${p.orderId}`);
  revalidatePath("/admin/finance");
  return { ok: "Отмечено: проверено" };
}

export async function bulkStatusAction(orderIds: string[], status: string) {
  const staff = await assertStaff("orders.edit");
  const s = z.enum(orderStatuses).parse(status);
  const ids = z.array(uuid).max(200).parse(orderIds);
  // Неоплаченные не уходят в печать массово (правило денег) — их пропускаем и считаем.
  let skipped = 0;
  for (const id of ids) if (await orderCommand(() => container().ordering.orders.changeStatus({ orderId: id, to: s, note: "Массовое изменение" }, staffActor(staff)))) skipped++;
  await audit(staff, "order.bulk_status", "order", null, { count: ids.length - skipped, status: s });
  revalidatePath("/admin/orders");
  revalidatePath("/admin/board");
  return { count: ids.length - skipped, skipped };
}

export async function assignOrderAction(orderId: string, assigneeId: string | null) {
  const staff = await assertStaff("orders.edit");
  const id = uuid.parse(orderId);
  const failed = await orderCommand(() => container().ordering.orders.assign(id, assigneeId ? uuid.parse(assigneeId) : null, staffActor(staff)));
  if (failed) throw new Error(failed.error);
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/board");
}

export async function updateOrderDetailsAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const parsed = z
    .object({
      orderId: uuid,
      contactName: z.string().trim().min(1, "Укажите имя").max(100),
      contactPhone: z.string().trim().min(5, "Укажите телефон").max(30),
      contactEmail: z.string().trim().toLowerCase().email("Проверьте e-mail"),
      deliveryMethod: z.enum(["pickup", "courier", "post"]).or(z.literal("")).optional(),
      city: z.string().trim().max(100).optional(),
      address: z.string().trim().max(300).optional(),
      postalCode: z.string().trim().max(20).optional(),
      desiredDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
      giftNote: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { orderId, ...d } = parsed.data;
  const failed = await orderCommand(() =>
    container().ordering.orders.updateDetails(
      {
        orderId,
        contact: { name: d.contactName, phone: d.contactPhone, email: d.contactEmail },
        delivery: { method: d.deliveryMethod || null, city: d.city || null, address: d.address || null, postalCode: d.postalCode || null },
        desiredDate: d.desiredDate || null,
        giftNote: d.giftNote || null,
      },
      staffActor(staff),
    ),
  );
  if (failed) return failed;
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Сохранено" };
}

// ─── CRM: задачи и заметки ─────────────────────────────────────────────────

function revalidateCrm(clientId?: string | null, orderId?: string | null, dealId?: string | null) {
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  if (clientId) revalidatePath(`/admin/clients/${clientId}`);
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
  if (dealId) revalidatePath(`/admin/deals/${dealId}`);
}

export async function createTaskAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff();
  const opt = (v: FormDataEntryValue | null) => (v ? String(v) : undefined);
  const parsed = z
    .object({
      title: z.string().trim().min(2, "Опишите задачу").max(300),
      dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).optional(),
      remindBeforeMin: z.union([z.literal("none").transform(() => null), z.coerce.number().int().min(0).max(10_080)]).optional(),
      clientId: uuid.optional(),
      orderId: uuid.optional(),
      dealId: uuid.optional(),
      assigneeId: uuid.optional(),
      kind: z.enum(["task", "call", "message", "meeting"]).default("task"),
    })
    .safeParse({
      title: form.get("title"),
      // Дата и необязательное время («17:30»): без времени срок — до конца рабочего дня.
      dueAt: opt(form.get("dueAt")) && opt(form.get("dueTime")) ? `${opt(form.get("dueAt"))}T${opt(form.get("dueTime"))}` : opt(form.get("dueAt")),
      remindBeforeMin: opt(form.get("remindBeforeMin")),
      clientId: opt(form.get("clientId")),
      orderId: opt(form.get("orderId")),
      dealId: opt(form.get("dealId")),
      assigneeId: opt(form.get("assigneeId")),
      kind: opt(form.get("kind")),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let clientId: string | null;
  try {
    ({ clientId } = await clientsCommand(() => container().clients.tasks.create(crmActor(staff), d)));
  } catch (err) {
    // Исполнитель отключён или не сотрудник — текстом в форме, как другие ошибки (B12).
    if (ClientsError.is(err) && err.code === "staffNotFound") return { error: err.message };
    throw err;
  }
  revalidateCrm(clientId, d.orderId, d.dealId);
  return { ok: "Задача добавлена" };
}

export async function toggleTaskAction(taskId: string) {
  const staff = await assertStaff();
  const t = await clientsCommand(() => container().clients.tasks.toggle(crmActor(staff), uuid.parse(taskId)));
  revalidateCrm(t.clientId, t.orderId, t.dealId);
}

/**
 * Правка задачи со страницы «Задачи» (поле за полем): заголовок, тип, срок («ГГГГ-ММ-ДД» или с временем; "" — без срока),
 * напоминание, ответственный, результат. Ошибка — текстом для строки задачи.
 */
export async function updateTaskAction(taskId: string, raw: { title?: string; kind?: string; dueAt?: string | null; remindBeforeMin?: string | null; assigneeId?: string; result?: string }): Promise<{ error?: string }> {
  const staff = await assertStaff();
  const parsed = z
    .object({
      title: z.string().trim().min(2, "Опишите задачу").max(300).optional(),
      kind: z.enum(["task", "call", "message", "meeting"]).optional(),
      dueAt: z
        .union([z.literal("").transform(() => null), z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Неверный срок")])
        .nullable()
        .optional(),
      remindBeforeMin: z.union([z.literal("none").transform(() => null), z.coerce.number().int().min(0).max(10_080)]).nullable().optional(),
      assigneeId: uuid.optional(),
      result: z.string().max(1000).optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const t = await container().clients.tasks.update(crmActor(staff), uuid.parse(taskId), parsed.data);
    revalidateCrm(t.clientId, t.orderId, t.dealId);
    return {};
  } catch (err) {
    if (ClientsError.is(err)) return { error: err.code === "forbidden" ? "Нет прав менять эту задачу" : err.message };
    throw err;
  }
}

export async function deleteTaskAction(taskId: string) {
  const staff = await assertStaff();
  const t = await clientsCommand(() => container().clients.tasks.delete(crmActor(staff), uuid.parse(taskId)));
  if (t) revalidateCrm(t.clientId, t.orderId, t.dealId);
}

export async function addNoteAction(_: AdminState, form: FormData): Promise<AdminState> {
  const dealOnly = !form.get("clientId") && !!form.get("dealId");
  // Заметка в сделке — право на сделки; в карточке клиента — на клиентов.
  const staff = await assertStaff(form.get("dealId") ? "deals.edit" : "clients.edit");
  const parsed = z
    .object({
      clientId: dealOnly ? z.undefined() : uuid,
      orderId: uuid.optional(),
      dealId: uuid.optional(),
      kind: z.enum(["note", "call", "message", "email"]).default("note"),
      text: z.string().trim().min(1, "Пустая заметка").max(5000),
    })
    .safeParse({ clientId: form.get("clientId") || undefined, orderId: form.get("orderId") || undefined, dealId: form.get("dealId") || undefined, kind: form.get("kind") || undefined, text: form.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.clientId) await guardClient(staff, parsed.data.clientId);
  if (parsed.data.dealId) await guardDeal(staff, parsed.data.dealId);
  await container().clients.notes.add(crmActor(staff), parsed.data);
  revalidateCrm(parsed.data.clientId, parsed.data.orderId, parsed.data.dealId);
  return { ok: "Заметка сохранена" };
}

export async function deleteNoteAction(noteId: string) {
  const staff = await assertStaff();
  const note = await container().clients.notes.find(uuid.parse(noteId));
  if (!note) return;
  if (!can(staff, "clients.edit") && !(note.dealId && can(staff, "deals.edit"))) throw new ForbiddenError();
  if (note.clientId) await guardClient(staff, note.clientId);
  if (note.dealId) await guardDeal(staff, note.dealId);
  // Системные записи (звонки, смены этапов) — часть истории, их не удаляем.
  const n = await clientsCommand(() => container().clients.notes.delete(note.id));
  if (n) await audit(staff, "note.delete", "client", n.clientId, { text: n.text.slice(0, 200) });
  if (n) revalidateCrm(n.clientId, n.orderId, n.dealId);
}

// ─── CRM: клиенты ───────────────────────────────────────────────────────────

export async function updateClientTagsAction(clientId: string, tags: string[]) {
  const staff = await assertStaff("clients.edit");
  const id = uuid.parse(clientId);
  await guardClient(staff, id);
  const clean = await container().clients.clients.setTags(id, z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).parse(tags));
  await audit(staff, "client.tags", "client", clientId, { tags: clean });
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
}

const reminderRefusal: Record<Exclude<ReminderResult, { ok: true }>["reason"], string> = {
  clientNotFound: "Клиент не найден",
  cooldown: `Напоминание уже отправлялось менее ${REMINDER_COOLDOWN_DAYS} дней назад`,
  noDraft: "У клиента нет незавершённых книг",
};

export async function remindClientAction(clientId: string): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("clients.edit");
  const admin = staff.user;
  await guardClient(staff, uuid.parse(clientId));
  const res = await container().notifications.reminders.send(uuid.parse(clientId), admin.id);
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/books");
  return res.ok ? { ok: true, message: "Напоминание отправлено" } : { ok: false, message: reminderRefusal[res.reason] };
}

export async function remindManyAction(clientIds: string[]): Promise<{ sent: number; skipped: number }> {
  const staff = await assertStaff("clients.edit");
  const admin = staff.user;
  let sent = 0;
  let skipped = 0;
  for (const id of z.array(uuid).max(300).parse(clientIds)) {
    await guardClient(staff, id);
    const res = await container().notifications.reminders.send(id, admin.id);
    if (res.ok) sent++;
    else skipped++;
  }
  revalidatePath("/admin/books");
  revalidatePath("/admin/clients");
  return { sent, skipped };
}


