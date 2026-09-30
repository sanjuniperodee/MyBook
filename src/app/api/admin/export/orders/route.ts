import { planName } from "@/i18n/labels";
import { desc } from "drizzle-orm";
import { api, apiUser, HttpError } from "@/lib/api";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { orderWhere } from "@/lib/crm-filters";
import { toCsv } from "@/lib/crm";

import { orderStatusLabel } from "@/lib/orders-shared";

export const GET = api(async (req) => {
  const admin = await apiUser(req);
  if (admin.role !== "admin") throw new HttpError(403, "forbidden");
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await db.select().from(orders).where(orderWhere(params, admin.id)).orderBy(desc(orders.createdAt)).limit(20_000);
  const csv = toCsv(
    ["Номер", "Создан", "Оплачен", "Статус", "Тариф", "Кол-во", "Книги", "Скидка", "Промокод", "Доставка", "Итого", "Валюта", "Имя", "Телефон", "E-mail", "Способ доставки", "Город", "Адрес", "Индекс", "Нужна к", "Трек-номер", "Комментарий"],
    rows.map((o) => [
      o.number,
      o.createdAt,
      o.paidAt,
      orderStatusLabel(o.status),
      planName(o.plan),
      o.quantity,
      o.itemsAmount,
      o.discountAmount,
      o.promoCode,
      o.deliveryAmount,
      o.amount,
      o.currency,
      o.contactName,
      o.contactPhone,
      o.contactEmail,
      o.deliveryMethod,
      o.city,
      o.address,
      o.postalCode,
      o.desiredDate,
      o.trackingNumber,
      o.customerComment,
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
