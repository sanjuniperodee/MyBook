"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { books, orders, users } from "@/lib/db/schema";
import { getBookPhotos, getBookStats } from "@/lib/books";
import { checkReadiness } from "@/lib/readiness";
import { addOrderEvent, calculatePrice, markOrderPaid, notifyNewOrder } from "@/lib/orders";
import { deliveryOptions, formatPrice, getPlan, plans, site } from "@/config/site";
import { describePromo, findValidPromo, reservePromo } from "@/lib/promo";
import { env } from "@/lib/env";

export interface CheckoutState {
  error?: string;
}

const schema = z
  .object({
    bookId: z.string().uuid(),
    plan: z.enum(plans.map((p) => p.id) as [string, ...string[]]),
    quantity: z.coerce.number().int().min(1).max(20).default(1),
    delivery: z.string().optional(),
    contactName: z.string().trim().min(2, "Укажите имя получателя").max(100),
    contactPhone: z.string().trim().regex(/^[+\d][\d\s()-]{9,20}$/, "Проверьте номер телефона"),
    contactEmail: z.string().trim().toLowerCase().email("Проверьте e-mail"),
    city: z.string().trim().max(100).optional(),
    address: z.string().trim().max(300).optional(),
    postalCode: z.string().trim().max(20).optional(),
    comment: z.string().trim().max(1000).optional(),
    promoCode: z.string().trim().max(40).optional(),
    consent: z.literal("on", { message: "Нужно согласие с условиями оферты" }),
  })
  .superRefine((d, ctx) => {
    const plan = getPlan(d.plan);
    if (!plan?.printed) return;
    const del = deliveryOptions.find((o) => o.id === d.delivery);
    if (!del) ctx.addIssue({ code: "custom", message: "Выберите способ доставки" });
    if (del && del.id !== "pickup") {
      if (!d.city) ctx.addIssue({ code: "custom", message: "Укажите город" });
      if (!d.address || d.address.length < 5) ctx.addIssue({ code: "custom", message: "Укажите адрес доставки" });
    }
  });

export async function createOrderAction(_: CheckoutState, form: FormData): Promise<CheckoutState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const book = await db.query.books.findFirst({ where: and(eq(books.id, d.bookId), eq(books.userId, user.id)) });
  if (!book) return { error: "Книга не найдена" };
  if (book.status !== "draft") return { error: "По этой книге уже оформлен заказ" };
  const [stats, photos] = await Promise.all([getBookStats(book), getBookPhotos(book.id)]);
  const blocking = checkReadiness(book, stats, photos).find((i) => i.level === "error");
  if (blocking) return { error: blocking.text };

  const plan = getPlan(d.plan)!;
  const delivery = plan.printed ? (d.delivery as (typeof deliveryOptions)[number]["id"]) : null;
  let promo = null;
  if (d.promoCode) {
    const check = await findValidPromo(d.promoCode);
    if (!check.ok) return { error: check.error };
    promo = check.promo;
  }
  const price = calculatePrice(plan.id, d.quantity, delivery, promo);

  let promoFailed = false;
  const order = await db.transaction(async (tx) => {
    if (promo && !(await reservePromo(tx, promo.id))) {
      promoFailed = true;
      tx.rollback();
    }
    const [o] = await tx
      .insert(orders)
      .values({
        userId: user.id,
        bookId: book.id,
        plan: plan.id,
        quantity: plan.printed ? d.quantity : 1,
        ...price,
        promoCode: promo?.code ?? null,
        currency: site.currency,
        paymentProvider: env.paymentProvider,
        contactName: d.contactName,
        contactPhone: d.contactPhone,
        contactEmail: d.contactEmail,
        deliveryMethod: delivery,
        city: plan.printed ? d.city || null : null,
        address: plan.printed ? d.address || null : null,
        postalCode: plan.printed ? d.postalCode || null : null,
        customerComment: d.comment || null,
        printSpec: null,
      })
      .returning();
    await tx.update(books).set({ status: "ordered" }).where(eq(books.id, book.id));
    if (!user.phone) await tx.update(users).set({ phone: d.contactPhone }).where(eq(users.id, user.id));
    return o;
  }).catch((e) => {
    if (promoFailed) return null;
    throw e;
  });
  if (!order) return { error: "Промокод больше не действует" };
  await addOrderEvent(
    order.id,
    "pending_payment",
    `Заказ создан, ${stats.printedPages} стр. (оценка)${promo ? `, промокод ${promo.code} (${describePromo(promo, formatPrice)})` : ""}`,
    "customer",
  );
  await notifyNewOrder(order);
  // Заказ полностью оплачен промокодом — сразу передаём в работу.
  if (order.amount === 0) await markOrderPaid(order.id, "promo", promo?.code);
  redirect(`/orders/${order.id}`);
}

export interface PromoPreview {
  ok: boolean;
  error?: string;
  code?: string;
  kind?: "percent" | "fixed";
  value?: number;
  label?: string;
}

/** Проверка промокода для предпросмотра скидки на странице оформления. */
export async function checkPromoAction(code: string): Promise<PromoPreview> {
  await requireUser();
  const { clientIp, rateLimit } = await import("@/lib/rate-limit");
  if (!rateLimit(`promo:${await clientIp()}`, 20, 600_000)) return { ok: false, error: "Слишком много попыток, попробуйте позже" };
  const check = await findValidPromo(code);
  if (!check.ok) return { ok: false, error: check.error };
  const p = check.promo;
  return { ok: true, code: p.code, kind: p.kind, value: p.value, label: describePromo(p, formatPrice) };
}
