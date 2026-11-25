import "server-only";
import { and, eq } from "drizzle-orm";
import type { OrderStatus } from "@/shared/domain/orders";
import { giftCards, orderEvents, orders, paymentInvoices } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { deletePrefix } from "@/shared/infrastructure/storage";

/** Заказ в работе: оплачен (или ушёл в печать с постоплатой) и ещё не доставлен и не отменён. */
export const ORDER_IN_PROGRESS: readonly OrderStatus[] = ["paid", "in_production", "shipped"];

export interface ClientOrderRef {
  id: string;
  number: number;
  bookId: string;
  status: OrderStatus;
}

/**
 * Персональные данные клиента в контексте «Заказы» (удаление аккаунта). Заказы и деньги остаются в учёте, но без
 * контактов, адреса и текстов; заказ в работе не трогаем, пока его не доставят или не отменят.
 */
export const orderingPrivacy = {
  async ordersOf(userId: string): Promise<ClientOrderRef[]> {
    return executor().select({ id: orders.id, number: orders.number, bookId: orders.bookId, status: orders.status }).from(orders).where(eq(orders.userId, userId));
  },

  /** Заказ без контактов, адреса, комментариев и открытки; файлы печати удаляются. Повторно — без изменений. */
  async anonymizeOrder(orderId: string) {
    const db = executor();
    await db
      .update(orders)
      .set({ contactName: "", contactPhone: "", contactEmail: "", city: null, address: null, postalCode: null, customerComment: null, giftNote: null, adminNote: null, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
    // В журнале заказа менеджеры пишут заметки свободным текстом — там бывают имена и телефоны.
    await db.update(orderEvents).set({ note: "" }).where(eq(orderEvents.orderId, orderId));
    await db.update(paymentInvoices).set({ phone: null }).where(and(eq(paymentInvoices.targetKind, "order"), eq(paymentInvoices.targetId, orderId)));
    await deletePrefix(`orders/${orderId}`);
  },

  /** Сертификаты, купленные клиентом: покупатель обезличен, получатель и сумма остаются (сертификат может быть не погашен). */
  async forgetBuyer(userId: string) {
    await executor().update(giftCards).set({ buyerName: "", buyerEmail: "", buyerPhone: "" }).where(eq(giftCards.buyerUserId, userId));
  },

  inProgress: (status: OrderStatus) => ORDER_IN_PROGRESS.includes(status),
};
