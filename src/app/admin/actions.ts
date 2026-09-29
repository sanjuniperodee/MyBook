"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { books, orders, orderStatuses, users } from "@/lib/db/schema";
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
