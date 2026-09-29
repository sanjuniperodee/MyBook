"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { addOrderEvent, setOrderStatus } from "@/lib/orders";
import { env } from "@/lib/env";
import { emailLayout, sendMail } from "@/lib/mail";

async function ownOrder(orderId: string) {
  const user = await requireUser();
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, orderId), eq(orders.userId, user.id)) });
  if (!order) throw new Error("Заказ не найден");
  return order;
}

/** Клиент сообщает, что оплатил переводом — администратор проверит поступление. */
export async function claimPaymentAction(orderId: string) {
  const order = await ownOrder(orderId);
  if (order.status !== "pending_payment" || order.paymentClaimedAt) return;
  await db.update(orders).set({ paymentClaimedAt: new Date() }).where(eq(orders.id, order.id));
  await addOrderEvent(order.id, null, "Клиент сообщил об оплате переводом", "customer");
  if (env.ordersNotifyEmail) {
    await sendMail(
      env.ordersNotifyEmail,
      `Проверьте оплату заказа №${order.number}`,
      emailLayout({ title: `Клиент оплатил заказ №${order.number}`, paragraphs: ["Проверьте поступление и подтвердите оплату в админке."], button: { label: "Открыть заказ", url: `${env.appUrl}/admin/orders/${order.id}` } }),
    );
  }
  revalidatePath(`/orders/${order.id}`);
}

export async function cancelOrderAction(orderId: string) {
  const order = await ownOrder(orderId);
  if (order.status !== "pending_payment") return;
  await setOrderStatus(order.id, "cancelled", "customer", "Отменён клиентом");
  revalidatePath(`/orders/${order.id}`);
}
