import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { orderEvents, orders } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import type { PlanId, DeliveryId } from "@/config/site";
import { Order, type OrderRepository } from "../../domain";

type Row = typeof orders.$inferSelect;

function toDomain(r: Row): Order {
  return Order.restore(r.id, {
    number: r.number,
    userId: r.userId,
    bookId: r.bookId,
    plan: r.plan as PlanId,
    quantity: r.quantity,
    price: { itemsAmount: r.itemsAmount, discountAmount: r.discountAmount, deliveryAmount: r.deliveryAmount, addonsAmount: r.addonsAmount, addons: r.addons as never, ...(r.prepaidAmount ? { prepaidAmount: r.prepaidAmount } : {}), amount: r.amount },
    promoCode: r.promoCode,
    currency: r.currency,
    status: r.status,
    paymentProvider: r.paymentProvider,
    paymentId: r.paymentId,
    paymentClaimedAt: r.paymentClaimedAt,
    contact: { name: r.contactName, phone: r.contactPhone, email: r.contactEmail },
    delivery: { method: (r.deliveryMethod as DeliveryId | null) ?? null, city: r.city, address: r.address, postalCode: r.postalCode },
    customerComment: r.customerComment,
    giftNote: r.giftNote,
    desiredDate: r.desiredDate,
    surprise: r.surprise,
    trackingNumber: r.trackingNumber,
    adminNote: r.adminNote,
    printSpec: r.printSpec,
    assigneeId: r.assigneeId,
    paidAt: r.paidAt,
    createdAt: r.createdAt,
  });
}

function toRow(order: Order) {
  const s = order.snapshot();
  return {
    userId: s.userId,
    bookId: s.bookId,
    plan: s.plan,
    quantity: s.quantity,
    itemsAmount: s.price.itemsAmount,
    discountAmount: s.price.discountAmount,
    deliveryAmount: s.price.deliveryAmount,
    addonsAmount: s.price.addonsAmount,
    addons: [...s.price.addons],
    prepaidAmount: s.price.prepaidAmount ?? 0,
    amount: s.price.amount,
    promoCode: s.promoCode,
    currency: s.currency,
    status: s.status,
    paymentProvider: s.paymentProvider,
    paymentId: s.paymentId,
    paymentClaimedAt: s.paymentClaimedAt,
    contactName: s.contact.name,
    contactPhone: s.contact.phone,
    contactEmail: s.contact.email,
    deliveryMethod: s.delivery.method,
    city: s.delivery.city,
    address: s.delivery.address,
    postalCode: s.delivery.postalCode,
    customerComment: s.customerComment,
    giftNote: s.giftNote,
    desiredDate: s.desiredDate,
    surprise: s.surprise,
    trackingNumber: s.trackingNumber,
    adminNote: s.adminNote,
    printSpec: s.printSpec,
    assigneeId: s.assigneeId,
    paidAt: s.paidAt,
  };
}

export class DrizzleOrderRepository implements OrderRepository {
  async nextIdentity() {
    const res = await executor().execute<{ n: number }>(sql`select nextval(pg_get_serial_sequence('orders', 'number'))::int as n`);
    return { id: randomUUID(), number: res.rows[0].n };
  }

  async findById(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await executor().select().from(orders).where(eq(orders.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByNumber(number: number) {
    if (!Number.isInteger(number)) return null;
    const [row] = await executor().select().from(orders).where(eq(orders.number, number)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findOwned(id: string, userId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [row] = await executor().select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, userId))).limit(1);
    return row ? toDomain(row) : null;
  }

  async hasOtherActiveOrders(bookId: string, exceptOrderId: string) {
    const rows = await executor()
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.bookId, bookId), ne(orders.id, exceptOrderId), ne(orders.status, "cancelled")))
      .limit(1);
    return rows.length > 0;
  }

  async hasPaidOrders(userId: string) {
    const rows = await executor()
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, userId), isNotNull(orders.paidAt), ne(orders.status, "cancelled")))
      .limit(1);
    return rows.length > 0;
  }

  async add(order: Order) {
    await executor().insert(orders).values({ id: order.id, number: order.number, ...toRow(order), createdAt: order.snapshot().createdAt });
    await this.flushHistory(order);
  }

  async save(order: Order) {
    await executor().update(orders).set({ ...toRow(order), updatedAt: new Date() }).where(eq(orders.id, order.id));
    await this.flushHistory(order);
  }

  private async flushHistory(order: Order) {
    const entries = order.pullHistory();
    if (entries.length) await executor().insert(orderEvents).values(entries.map((e) => ({ orderId: order.id, status: e.status, note: e.note, actor: e.actor, createdAt: e.at })));
  }
}
