"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertStaff, assertVisible, audit, can, ForbiddenError, type Staff } from "@/server/access";
import { db } from "@/lib/db";
import { crmDeals, crmNotes, crmTasks, orders, orderStatuses, users } from "@/lib/db/schema";
import { notify } from "@/lib/crm/notify";
import { notifyMentions } from "@/lib/crm/mentions";
import { normalizePromoCode, OrderingError } from "@/modules/ordering";
import type { Actor } from "@/shared/application";
import { container } from "@/server/container";

export interface AdminState {
  error?: string;
  ok?: string;
}

const actor = (email: string) => `admin:${email}`;

async function guardDeal(staff: Staff, dealId: string) {
  if (staff.scope === "all") return;
  const d = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, dealId), columns: { assigneeId: true } });
  assertVisible(staff, d?.assigneeId);
}

/** Клиент чужого менеджера для роли «только свои» недоступен и в действиях. */
async function guardClient(staff: Staff, clientId: string) {
  if (staff.scope === "all") return;
  const c = await db.query.users.findFirst({ where: eq(users.id, clientId), columns: { managerId: true } });
  assertVisible(staff, c?.managerId);
}

/** Подпись сотрудника в журналах заказа. */
const staffActor = (staff: Staff): Actor => ({ label: actor(staff.user.email), userId: staff.user.id });

/** Ошибку домена показываем сотруднику текстом, остальное — как есть. */
async function orderCommand(run: () => Promise<unknown>): Promise<AdminState | null> {
  try {
    await run();
    return null;
  } catch (err) {
    if (err instanceof OrderingError) return { error: orderingStaffMessage(err) };
    throw err;
  }
}

function orderingStaffMessage(err: OrderingError) {
  switch (err.code) {
    case "orderNotFound":
      return "Заказ не найден";
    case "invalidTransition":
      return "Такой переход статуса невозможен";
    case "staffNotFound":
      return "Ответственным может быть только сотрудник CRM";
    case "promoExists":
      return "Такой промокод уже есть";
    default:
      return err.message;
  }
}

export async function updateOrderAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const parsed = z
    .object({
      orderId: z.string().uuid(),
      status: z.enum(orderStatuses),
      trackingNumber: z.string().trim().max(100).optional(),
      note: z.string().trim().max(1000).optional(),
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
  const orderId = z.string().uuid().parse(form.get("orderId"));
  await container().ordering.orders.saveAdminNote(orderId, String(form.get("adminNote") ?? ""));
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Заметка сохранена" };
}

export async function generateFilesAction(orderId: string) {
  const staff = await assertStaff("orders.files");
  await container().ordering.orders.regeneratePrintFiles(z.string().uuid().parse(orderId), staffActor(staff));
  revalidatePath(`/admin/orders/${orderId}`);
}

/** Временно открыть книгу для правок клиентом (например, по просьбе исправить опечатку). */
export async function toggleBookLockAction(orderId: string) {
  const staff = await assertStaff("orders.edit");
  await container().ordering.orders.toggleBookEditing(z.string().uuid().parse(orderId), staffActor(staff));
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
  const promo = await container().ordering.promos.toggle(z.string().uuid().parse(id));
  await audit(staff, promo.active ? "promo.enable" : "promo.disable", "promo", promo.code);
  revalidatePath("/admin/promo");
}

// ─── CRM: заказы ────────────────────────────────────────────────────────────

/** Перемещение карточки на канбан-доске. */
export async function moveOrderAction(orderId: string, status: string) {
  const staff = await assertStaff("orders.edit");
  await container().ordering.orders.changeStatus({ orderId: z.string().uuid().parse(orderId), to: z.enum(orderStatuses).parse(status) }, staffActor(staff));
  revalidatePath("/admin/board");
  revalidatePath("/admin");
}

export async function bulkStatusAction(orderIds: string[], status: string) {
  const staff = await assertStaff("orders.edit");
  const s = z.enum(orderStatuses).parse(status);
  const ids = z.array(z.string().uuid()).max(200).parse(orderIds);
  for (const id of ids) await container().ordering.orders.changeStatus({ orderId: id, to: s, note: "Массовое изменение" }, staffActor(staff));
  await audit(staff, "order.bulk_status", "order", null, { count: ids.length, status: s });
  revalidatePath("/admin/orders");
  revalidatePath("/admin/board");
  return { count: ids.length };
}

export async function assignOrderAction(orderId: string, assigneeId: string | null) {
  const staff = await assertStaff("orders.edit");
  const id = z.string().uuid().parse(orderId);
  const failed = await orderCommand(() => container().ordering.orders.assign(id, assigneeId ? z.string().uuid().parse(assigneeId) : null, staffActor(staff)));
  if (failed) throw new Error(failed.error);
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/board");
}

export async function updateOrderDetailsAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const parsed = z
    .object({
      orderId: z.string().uuid(),
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

/** Чужие задачи можно закрывать и удалять только с правом tasks.all. */
function assertTaskAccess(staff: Staff, t: { assigneeId: string | null; createdById: string | null }) {
  if (can(staff, "tasks.all") || !t.assigneeId || t.assigneeId === staff.user.id || t.createdById === staff.user.id) return;
  throw new ForbiddenError();
}

function revalidateCrm(clientId?: string | null, orderId?: string | null, dealId?: string | null) {
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
  if (clientId) revalidatePath(`/admin/clients/${clientId}`);
  if (orderId) revalidatePath(`/admin/orders/${orderId}`);
  if (dealId) revalidatePath(`/admin/deals/${dealId}`);
}

export async function createTaskAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff();
  const admin = staff.user;
  const opt = (v: FormDataEntryValue | null) => (v ? String(v) : undefined);
  const parsed = z
    .object({
      title: z.string().trim().min(2, "Опишите задачу").max(300),
      dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/).optional(),
      clientId: z.string().uuid().optional(),
      orderId: z.string().uuid().optional(),
      dealId: z.string().uuid().optional(),
      assigneeId: z.string().uuid().optional(),
      kind: z.enum(["task", "call", "message", "meeting"]).default("task"),
    })
    .safeParse({
      title: form.get("title"),
      dueAt: opt(form.get("dueAt")),
      clientId: opt(form.get("clientId")),
      orderId: opt(form.get("orderId")),
      dealId: opt(form.get("dealId")),
      assigneeId: opt(form.get("assigneeId")),
      kind: opt(form.get("kind")),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  let clientId = d.clientId ?? null;
  if (d.orderId && !clientId) {
    const o = await db.query.orders.findFirst({ where: eq(orders.id, d.orderId), columns: { userId: true } });
    clientId = o?.userId ?? null;
  }
  if (d.dealId && !clientId) {
    const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, d.dealId), columns: { clientId: true } });
    clientId = deal?.clientId ?? null;
  }
  const dueAt = d.dueAt ? new Date(d.dueAt.length === 10 ? `${d.dueAt}T18:00:00` : d.dueAt) : null;
  const assigneeId = d.assigneeId ?? admin.id;
  // «Только свои» ставит задачи себе; назначать другим — роли с видимостью «все».
  if (assigneeId !== admin.id && staff.scope !== "all") throw new ForbiddenError();
  await db.insert(crmTasks).values({ title: d.title, kind: d.kind, dueAt, clientId, orderId: d.orderId ?? null, dealId: d.dealId ?? null, assigneeId, createdById: admin.id });
  if (assigneeId !== admin.id)
    await notify([assigneeId], { kind: "task", title: `Новая задача: ${d.title}`, body: `Поставил(а) ${admin.name || admin.email}`, link: d.dealId ? `/admin/deals/${d.dealId}` : d.orderId ? `/admin/orders/${d.orderId}` : "/admin/tasks" });
  revalidateCrm(clientId, d.orderId, d.dealId);
  return { ok: "Задача добавлена" };
}

export async function toggleTaskAction(taskId: string) {
  const staff = await assertStaff();
  const t = await db.query.crmTasks.findFirst({ where: eq(crmTasks.id, z.string().uuid().parse(taskId)) });
  if (!t) throw new Error("Задача не найдена");
  assertTaskAccess(staff, t);
  await db.update(crmTasks).set({ doneAt: t.doneAt ? null : new Date() }).where(eq(crmTasks.id, t.id));
  revalidateCrm(t.clientId, t.orderId, t.dealId);
}

export async function deleteTaskAction(taskId: string) {
  const staff = await assertStaff();
  const current = await db.query.crmTasks.findFirst({ where: eq(crmTasks.id, z.string().uuid().parse(taskId)) });
  if (!current) return;
  assertTaskAccess(staff, current);
  const [t] = await db.delete(crmTasks).where(eq(crmTasks.id, current.id)).returning();
  if (t) revalidateCrm(t.clientId, t.orderId, t.dealId);
}

export async function addNoteAction(_: AdminState, form: FormData): Promise<AdminState> {
  const dealOnly = !form.get("clientId") && !!form.get("dealId");
  // Заметка в сделке — право на сделки; в карточке клиента — на клиентов.
  const staff = await assertStaff(form.get("dealId") ? "deals.edit" : "clients.edit");
  const admin = staff.user;
  const parsed = z
    .object({
      clientId: dealOnly ? z.undefined() : z.string().uuid(),
      orderId: z.string().uuid().optional(),
      dealId: z.string().uuid().optional(),
      kind: z.enum(["note", "call", "message", "email"]).default("note"),
      text: z.string().trim().min(1, "Пустая заметка").max(5000),
    })
    .safeParse({ clientId: form.get("clientId") || undefined, orderId: form.get("orderId") || undefined, dealId: form.get("dealId") || undefined, kind: form.get("kind") || undefined, text: form.get("text") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.clientId) await guardClient(staff, parsed.data.clientId);
  if (parsed.data.dealId) await guardDeal(staff, parsed.data.dealId);
  await db.insert(crmNotes).values({ ...parsed.data, clientId: parsed.data.clientId ?? null, orderId: parsed.data.orderId ?? null, dealId: parsed.data.dealId ?? null, authorId: admin.id });
  const link = parsed.data.dealId ? `/admin/deals/${parsed.data.dealId}` : parsed.data.orderId ? `/admin/orders/${parsed.data.orderId}` : `/admin/clients/${parsed.data.clientId}`;
  await notifyMentions(parsed.data.text, admin.id, admin.name || admin.email, link, parsed.data.dealId ? "заметка в сделке" : "заметка о клиенте");
  revalidateCrm(parsed.data.clientId, parsed.data.orderId, parsed.data.dealId);
  return { ok: "Заметка сохранена" };
}

export async function deleteNoteAction(noteId: string) {
  const staff = await assertStaff();
  const note = await db.query.crmNotes.findFirst({ where: eq(crmNotes.id, z.string().uuid().parse(noteId)) });
  if (!note) return;
  if (!can(staff, "clients.edit") && !(note.dealId && can(staff, "deals.edit"))) throw new ForbiddenError();
  if (note.clientId) await guardClient(staff, note.clientId);
  if (note.dealId) await guardDeal(staff, note.dealId);
  // Системные записи (звонки, смены этапов) — часть истории, их не удаляем.
  if (note.kind === "system") throw new ForbiddenError();
  const [n] = await db.delete(crmNotes).where(eq(crmNotes.id, note.id)).returning();
  if (n) await audit(staff, "note.delete", "client", n.clientId, { text: n.text.slice(0, 200) });
  if (n) revalidateCrm(n.clientId, n.orderId, n.dealId);
}

// ─── CRM: клиенты ───────────────────────────────────────────────────────────

export async function updateClientTagsAction(clientId: string, tags: string[]) {
  const staff = await assertStaff("clients.edit");
  const clean = [...new Set(z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).parse(tags))];
  await guardClient(staff, z.string().uuid().parse(clientId));
  await db.update(users).set({ tags: clean }).where(eq(users.id, z.string().uuid().parse(clientId)));
  await audit(staff, "client.tags", "client", clientId, { tags: clean });
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
}

export async function remindClientAction(clientId: string): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("clients.edit");
  const admin = staff.user;
  await guardClient(staff, z.string().uuid().parse(clientId));
  const { sendBookReminder } = await import("@/lib/crm-reminders");
  const res = await sendBookReminder(z.string().uuid().parse(clientId), admin.id);
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/books");
  return res.ok ? { ok: true, message: "Напоминание отправлено" } : { ok: false, message: res.reason };
}

export async function remindManyAction(clientIds: string[]): Promise<{ sent: number; skipped: number }> {
  const staff = await assertStaff("clients.edit");
  const admin = staff.user;
  const { sendBookReminder } = await import("@/lib/crm-reminders");
  let sent = 0;
  let skipped = 0;
  for (const id of z.array(z.string().uuid()).max(300).parse(clientIds)) {
    await guardClient(staff, id);
    const res = await sendBookReminder(id, admin.id);
    if (res.ok) sent++;
    else skipped++;
  }
  revalidatePath("/admin/books");
  revalidatePath("/admin/clients");
  return { sent, skipped };
}


