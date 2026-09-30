"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertStaff, assertVisible, audit, can, ForbiddenError, type Staff } from "@/lib/crm/rbac";
import { db } from "@/lib/db";
import { books, crmDeals, crmNotes, crmTasks, orders, orderStatuses, promoCodes, users } from "@/lib/db/schema";
import { notify } from "@/lib/crm/notify";
import { normalizePromoCode } from "@/lib/pricing";
import { addOrderEvent, ensurePrintFiles, markOrderPaid, setOrderStatus } from "@/lib/orders";

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

export async function updateOrderAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const admin = staff.user;
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
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return { error: "Заказ не найден" };
  if (trackingNumber !== undefined && trackingNumber !== (order.trackingNumber ?? "")) {
    await db.update(orders).set({ trackingNumber: trackingNumber || null }).where(eq(orders.id, orderId));
  }
  if (status !== order.status) {
    if (status === "paid" && order.status === "pending_payment") await markOrderPaid(orderId, actor(admin.email));
    else await setOrderStatus(orderId, status, actor(admin.email), note ?? "");
  } else if (note) {
    await addOrderEvent(orderId, null, note, actor(admin.email));
  }
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Сохранено" };
}

export async function saveAdminNoteAction(_: AdminState, form: FormData): Promise<AdminState> {
  await assertStaff("orders.edit");
  const orderId = z.string().uuid().parse(form.get("orderId"));
  const note = String(form.get("adminNote") ?? "").slice(0, 5000);
  await db.update(orders).set({ adminNote: note || null }).where(eq(orders.id, orderId));
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Заметка сохранена" };
}

export async function generateFilesAction(orderId: string) {
  const staff = await assertStaff("orders.files");
  const admin = staff.user;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new Error("Заказ не найден");
  await ensurePrintFiles(order, true);
  await addOrderEvent(order.id, null, "Файлы для печати сгенерированы", actor(admin.email));
  revalidatePath(`/admin/orders/${orderId}`);
}

/** Временно открыть книгу для правок клиентом (например, по просьбе исправить опечатку). */
export async function toggleBookLockAction(orderId: string) {
  const staff = await assertStaff("orders.edit");
  const admin = staff.user;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { book: true } });
  if (!order) throw new Error("Заказ не найден");
  const next = order.book.status === "draft" ? "ordered" : "draft";
  await db.update(books).set({ status: next }).where(eq(books.id, order.bookId));
  await addOrderEvent(order.id, null, next === "draft" ? "Книга открыта для правок" : "Книга снова закрыта для правок", actor(admin.email));
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
  const exists = await db.query.promoCodes.findFirst({ where: eq(promoCodes.code, d.code) });
  if (exists) return { error: "Такой промокод уже есть" };
  const expiresAt = d.expiresAt ? new Date(d.expiresAt.getTime() + 24 * 3600 * 1000 - 1) : null; // действует до конца дня
  await db.insert(promoCodes).values({ code: d.code, kind: d.kind, value: d.value, maxUses: d.maxUses ?? null, expiresAt, note: d.note ?? "" });
  await audit(staff, "promo.create", "promo", d.code, { kind: d.kind, value: d.value });
  revalidatePath("/admin/promo");
  return { ok: `Промокод ${d.code} создан` };
}

export async function togglePromoAction(id: string) {
  const staff = await assertStaff("promo.manage");
  const promo = await db.query.promoCodes.findFirst({ where: eq(promoCodes.id, id) });
  if (!promo) throw new Error("Промокод не найден");
  await db.update(promoCodes).set({ active: !promo.active }).where(eq(promoCodes.id, id));
  await audit(staff, promo.active ? "promo.disable" : "promo.enable", "promo", promo.code);
  revalidatePath("/admin/promo");
}

// ─── CRM: заказы ────────────────────────────────────────────────────────────

async function applyStatus(orderId: string, status: (typeof orderStatuses)[number], adminEmail: string, note = "") {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new Error("Заказ не найден");
  if (order.status === status) return;
  if (status === "paid" && order.status === "pending_payment") await markOrderPaid(orderId, actor(adminEmail));
  else await setOrderStatus(orderId, status, actor(adminEmail), note);
}

/** Перемещение карточки на канбан-доске. */
export async function moveOrderAction(orderId: string, status: string) {
  const staff = await assertStaff("orders.edit");
  const admin = staff.user;
  const s = z.enum(orderStatuses).parse(status);
  await applyStatus(z.string().uuid().parse(orderId), s, admin.email);
  revalidatePath("/admin/board");
  revalidatePath("/admin");
}

export async function bulkStatusAction(orderIds: string[], status: string) {
  const staff = await assertStaff("orders.edit");
  const admin = staff.user;
  const s = z.enum(orderStatuses).parse(status);
  const ids = z.array(z.string().uuid()).max(200).parse(orderIds);
  for (const id of ids) await applyStatus(id, s, admin.email, "Массовое изменение");
  await audit(staff, "order.bulk_status", "order", null, { count: ids.length, status: s });
  revalidatePath("/admin/orders");
  revalidatePath("/admin/board");
  return { count: ids.length };
}

export async function assignOrderAction(orderId: string, assigneeId: string | null) {
  const staff = await assertStaff("orders.edit");
  const admin = staff.user;
  const id = z.string().uuid().parse(orderId);
  let label = "снят";
  if (assigneeId) {
    const a = await db.query.users.findFirst({ where: eq(users.id, z.string().uuid().parse(assigneeId)) });
    if (!a || a.role !== "admin") throw new Error("Ответственным может быть только администратор");
    label = a.name || a.email;
  }
  await db.update(orders).set({ assigneeId }).where(eq(orders.id, id));
  await addOrderEvent(id, null, `Ответственный: ${label}`, actor(admin.email));
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/board");
}

export async function updateOrderDetailsAction(_: AdminState, form: FormData): Promise<AdminState> {
  const staff = await assertStaff("orders.edit");
  const admin = staff.user;
  const parsed = z
    .object({
      orderId: z.string().uuid(),
      contactName: z.string().trim().min(1, "Укажите имя").max(100),
      contactPhone: z.string().trim().min(5, "Укажите телефон").max(30),
      contactEmail: z.string().trim().toLowerCase().email("Проверьте e-mail"),
      deliveryMethod: z.string().max(20).optional(),
      city: z.string().trim().max(100).optional(),
      address: z.string().trim().max(300).optional(),
      postalCode: z.string().trim().max(20).optional(),
      desiredDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
      giftNote: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { orderId, ...d } = parsed.data;
  await db
    .update(orders)
    .set({
      contactName: d.contactName,
      contactPhone: d.contactPhone,
      contactEmail: d.contactEmail,
      deliveryMethod: d.deliveryMethod || null,
      city: d.city || null,
      address: d.address || null,
      postalCode: d.postalCode || null,
      desiredDate: d.desiredDate || null,
      giftNote: d.giftNote || null,
    })
    .where(eq(orders.id, orderId));
  await addOrderEvent(orderId, null, "Контакты и доставка изменены", actor(admin.email));
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


