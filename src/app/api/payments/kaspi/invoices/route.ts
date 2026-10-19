import { NextResponse } from "next/server";
import { z } from "zod";
import { uuid } from "@/server/input";
import { api, apiUser, checkOrigin, HttpError } from "@/server/api";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { container } from "@/server/container";
import { OrderingError, PAY_TOKEN } from "@/modules/ordering";
import { invoiceView } from "../view";

const method = z.enum(["invoice", "qr"]);
const phone = z.string().trim().max(32).optional();
const schema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("order"), orderId: uuid, method, phone }),
  z.object({ target: z.literal("gift"), token: z.string().regex(/^[A-Za-z0-9_-]{20,40}$/), method, phone }),
  // Счёт из чата по ссылке /pay/<token> — без входа: номер не указан — сервер берёт номер WhatsApp-чата из счёта.
  z.object({ target: z.literal("deal_invoice"), token: z.string().regex(PAY_TOKEN), method, phone }),
]);

/** Выставить счёт Kaspi (в приложение по номеру) или QR на оплату заказа клиента, сертификата или счёта из чата по ссылке. */
export const POST = api(async (req) => {
  checkOrigin(req);
  const body = schema.parse(await req.json());
  // Каждый счёт — уведомление в Kaspi клиента: не даём засыпать ими.
  if (!(await rateLimit(`kaspi-invoice:${await trustedClientIp()}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
  const kaspi = container().ordering.kaspi;
  if (body.target === "deal_invoice") {
    // Ссылку на счёт могли переслать: номер клиента не засыпать счетами и с разных адресов.
    if (!(await rateLimit(`kaspi-invoice-pay:${body.token}`, 10, 60 * 60_000))) throw new HttpError(429, "kaspiRate");
    try {
      return NextResponse.json({ invoice: await invoiceView(await kaspi.payDealInvoice(body.token, body)) });
    } catch (err) {
      // Счёт уже оплачен, отменён или истёк — текст про счёт, а не про заказ.
      if (OrderingError.is(err) && err.code === "notPayable") throw new HttpError(409, "invoiceClosed");
      throw err;
    }
  }
  const invoice = body.target === "order" ? await kaspi.payOrder(body.orderId, (await apiUser(req)).id, body) : await kaspi.payGift(body.token, body);
  return NextResponse.json({ invoice: await invoiceView(invoice) });
});
