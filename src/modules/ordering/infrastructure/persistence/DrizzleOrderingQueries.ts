import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { giftCards, orderEvents, orders, promoCodes } from "@/shared/infrastructure/db/schema";
import { rootDb } from "@/shared/infrastructure/database";

/**
 * Read-модели заказов для страниц (CQRS-lite): чтение не обязано собирать агрегаты —
 * отдаём ровно то, что нужно экрану, одним запросом.
 */
export class DrizzleOrderingQueries {
  /** Заказ с книгой, клиентом и журналом — карточка заказа, печать упаковочного листа, файлы. */
  orderDetails(orderId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return Promise.resolve(undefined);
    return rootDb.query.orders.findFirst({ where: eq(orders.id, orderId), with: { book: true, user: true, events: { orderBy: desc(orderEvents.createdAt) } } });
  }

  async ownedOrderDetails(orderId: string, userId: string) {
    const o = await this.orderDetails(orderId);
    return o && o.userId === userId ? o : undefined;
  }

  userOrders(userId: string) {
    return rootDb.query.orders.findMany({ where: eq(orders.userId, userId), with: { book: true }, orderBy: desc(orders.createdAt) });
  }

  giftByToken(token: string) {
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return Promise.resolve(undefined);
    return rootDb.query.giftCards.findFirst({ where: eq(giftCards.token, token), with: { promo: true } });
  }

  giftById(id: string) {
    return rootDb.query.giftCards.findFirst({ where: eq(giftCards.id, id), with: { promo: true } });
  }

  giftByPromo(promoId: string) {
    return rootDb.query.giftCards.findFirst({ where: eq(giftCards.promoCodeId, promoId) });
  }

  /** Промокоды с выручкой и числом оплаченных заказов — экран «Промокоды». */
  promoStats() {
    return rootDb
      .select({
        promo: promoCodes,
        revenue: sql<number>`coalesce((select sum(${orders.amount}) from ${orders} where ${orders.promoCode} = ${promoCodes.code} and ${orders.paidAt} is not null), 0)::int`,
        paid: sql<number>`(select count(*)::int from ${orders} where ${orders.promoCode} = ${promoCodes.code} and ${orders.paidAt} is not null)`,
      })
      .from(promoCodes)
      .orderBy(desc(promoCodes.createdAt));
  }

  /** Сертификаты для CRM. */
  recentGifts(limit = 300) {
    return rootDb.query.giftCards.findMany({ orderBy: desc(giftCards.createdAt), with: { promo: true }, limit });
  }

  /** Последний заказ книги — для карточки книги в кабинете клиента. */
  async lastOrderOfBook(bookId: string) {
    return (await rootDb.query.orders.findFirst({ where: eq(orders.bookId, bookId), orderBy: desc(orders.createdAt) })) ?? null;
  }

  async bookHasOrders(bookId: string) {
    const [r] = await rootDb.select({ id: orders.id }).from(orders).where(eq(orders.bookId, bookId)).limit(1);
    return !!r;
  }

  printJob(orderId: string) {
    return rootDb.query.orders.findFirst({ where: and(eq(orders.id, orderId)), columns: { id: true, bookId: true, number: true } });
  }
}

export type OrderDetailsView = NonNullable<Awaited<ReturnType<DrizzleOrderingQueries["orderDetails"]>>>;
export type GiftView = NonNullable<Awaited<ReturnType<DrizzleOrderingQueries["giftByToken"]>>>;
