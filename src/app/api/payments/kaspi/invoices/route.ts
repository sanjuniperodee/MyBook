import { NextResponse } from "next/server";
import { z } from "zod";
import { api, apiUser, checkOrigin, HttpError } from "@/server/api";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import { container } from "@/server/container";
import { invoiceView } from "../view";

const method = z.enum(["invoice", "qr"]);
const phone = z.string().trim().max(32).optional();
const schema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("order"), orderId: z.string().uuid(), method, phone }),
  z.object({ target: z.literal("gift"), token: z.string().regex(/^[A-Za-z0-9_-]{20,40}$/), method, phone }),
]);

/** Выставить счёт Kaspi (в приложение по номеру) или QR на оплату заказа клиента или сертификата по ссылке. */
export const POST = api(async (req) => {
  checkOrigin(req);
  const body = schema.parse(await req.json());
  // Каждый счёт — уведомление в Kaspi клиента: не даём засыпать ими.
  if (!(await rateLimit(`kaspi-invoice:${await trustedClientIp()}`, 10, 10 * 60_000))) throw new HttpError(429, "kaspiRate");
  const kaspi = container().ordering.kaspi;
  const invoice = body.target === "order" ? await kaspi.payOrder(body.orderId, (await apiUser(req)).id, body) : await kaspi.payGift(body.token, body);
  return NextResponse.json({ invoice: await invoiceView(invoice) });
});
