"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { books, orders, orderStatuses, promoCodes, users } from "@/lib/db/schema";
import { normalizePromoCode } from "@/lib/pricing";
import { addOrderEvent, ensurePrintFiles, markOrderPaid, setOrderStatus } from "@/lib/orders";

export interface AdminState {
  error?: string;
  ok?: string;
}

const actor = (email: string) => `admin:${email}`;

export async function updateOrderAction(_: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
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
  await requireAdmin();
  const orderId = z.string().uuid().parse(form.get("orderId"));
  const note = String(form.get("adminNote") ?? "").slice(0, 5000);
  await db.update(orders).set({ adminNote: note || null }).where(eq(orders.id, orderId));
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: "Заметка сохранена" };
}

export async function generateFilesAction(orderId: string) {
  const admin = await requireAdmin();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new Error("Заказ не найден");
  await ensurePrintFiles(order, true);
  await addOrderEvent(order.id, null, "Файлы для печати сгенерированы", actor(admin.email));
  revalidatePath(`/admin/orders/${orderId}`);
}

/** Временно открыть книгу для правок клиентом (например, по просьбе исправить опечатку). */
export async function toggleBookLockAction(orderId: string) {
  const admin = await requireAdmin();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { book: true } });
  if (!order) throw new Error("Заказ не найден");
  const next = order.book.status === "draft" ? "ordered" : "draft";
  await db.update(books).set({ status: next }).where(eq(books.id, order.bookId));
  await addOrderEvent(order.id, null, next === "draft" ? "Книга открыта для правок" : "Книга снова закрыта для правок", actor(admin.email));
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function setUserRoleAction(userId: string, role: "user" | "admin") {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("Нельзя изменить собственную роль");
  await db.update(users).set({ role }).where(eq(users.id, userId));
  revalidatePath("/admin/users");
}

export async function createPromoAction(_: AdminState, form: FormData): Promise<AdminState> {
  await requireAdmin();
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
  revalidatePath("/admin/promo");
  return { ok: `Промокод ${d.code} создан` };
}

export async function togglePromoAction(id: string) {
  await requireAdmin();
  const promo = await db.query.promoCodes.findFirst({ where: eq(promoCodes.id, id) });
  if (!promo) throw new Error("Промокод не найден");
  await db.update(promoCodes).set({ active: !promo.active }).where(eq(promoCodes.id, id));
  revalidatePath("/admin/promo");
}
