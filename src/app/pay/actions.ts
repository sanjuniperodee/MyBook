"use server";

import { z } from "zod";
import { getMessages, lredirect } from "@/i18n/server";
import { PAY_TOKEN } from "@/modules/ordering";
import { container } from "@/server/container";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";

/**
 * Клиент сообщил, что оплатил счёт из чата переводом: ответственному — проверить поступление (подписчики события
 * ordering.deal_invoice_claimed). Кнопку жмут по ссылке без входа: лимит не даёт перебирать токены.
 */
export async function claimDealInvoicePaymentAction(rawToken: string): Promise<{ error?: string } | void> {
  // Лимит — с текстом, как у сертификата: иначе кнопка «Я оплатил(а)» молча ничего не делает.
  if (!(await rateLimit(`pay-claim:${await trustedClientIp()}`, 20, 600_000))) return { error: (await getMessages()).common.errors.tooMany };
  const token = z.string().regex(PAY_TOKEN).safeParse(rawToken);
  if (!token.success) return; // как и для неизвестного токена
  const invoice = await container().ordering.invoices.claim(token.data);
  if (!invoice) return;
  return lredirect(`/pay/${invoice.token}`);
}
