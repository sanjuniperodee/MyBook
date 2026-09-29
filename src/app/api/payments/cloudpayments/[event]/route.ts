import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { giftCards, orders } from "@/lib/db/schema";
import { markGiftPaid } from "@/lib/gifts";
import { verifyCloudPaymentsSignature } from "@/lib/payments";
import { addOrderEvent, markOrderPaid } from "@/lib/orders";

/**
 * Уведомления CloudPayments: /api/payments/cloudpayments/check | pay | fail
 * Укажите эти адреса в личном кабинете CloudPayments (формат — по умолчанию, кодировка UTF-8).
 */
export async function POST(req: Request, { params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  const raw = await req.text();
  const signature = req.headers.get("content-hmac") ?? req.headers.get("x-content-hmac");
  if (!verifyCloudPaymentsSignature(raw, signature)) {
    return NextResponse.json({ code: 13 }, { status: 401 });
  }
  const body: Record<string, string> = req.headers.get("content-type")?.includes("application/json")
    ? JSON.parse(raw)
    : Object.fromEntries(new URLSearchParams(raw));

  // Сертификаты оплачиваются с InvoiceId вида «G123».
  if (/^G\d+$/.test(body.InvoiceId ?? "")) return handleGift(event, body);

  const number = Number(body.InvoiceId);
  const order = Number.isInteger(number) ? await db.query.orders.findFirst({ where: eq(orders.number, number) }) : undefined;
  if (!order) return NextResponse.json({ code: 10 });
  if (Math.round(Number(body.Amount)) !== order.amount || (body.Currency && body.Currency !== order.currency)) return NextResponse.json({ code: 12 });

  switch (event) {
    case "check":
      return NextResponse.json({ code: order.status === "pending_payment" ? 0 : 13 });
    case "pay":
      await markOrderPaid(order.id, "cloudpayments", body.TransactionId);
      return NextResponse.json({ code: 0 });
    case "fail":
      await addOrderEvent(order.id, null, `Неуспешная оплата: ${body.Reason ?? body.ReasonCode ?? "без причины"}`, "cloudpayments");
      return NextResponse.json({ code: 0 });
    default:
      return NextResponse.json({ code: 0 });
  }
}

async function handleGift(event: string, body: Record<string, string>) {
  const gift = await db.query.giftCards.findFirst({ where: eq(giftCards.number, Number(body.InvoiceId.slice(1))) });
  if (!gift) return NextResponse.json({ code: 10 });
  if (Math.round(Number(body.Amount)) !== gift.amount || (body.Currency && body.Currency !== gift.currency)) return NextResponse.json({ code: 12 });
  if (event === "check") return NextResponse.json({ code: gift.status === "pending_payment" ? 0 : 13 });
  if (event === "pay") await markGiftPaid(gift.id, "cloudpayments", body.TransactionId);
  return NextResponse.json({ code: 0 });
}
