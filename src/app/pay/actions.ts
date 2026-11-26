"use server";

import { ApiClientError } from "@mybook/contracts";
import { z } from "zod";
import { PAY_TOKEN } from "@/shared/domain/orders";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { v1WebAction } from "@/web/api";

/**
 * Клиент сообщил, что оплатил счёт из чата переводом: ответственному — проверить поступление (подписчики события
 * ordering.deal_invoice_claimed). Кнопку жмут по ссылке без входа: лимит не даёт перебирать токены.
 */
export async function claimDealInvoicePaymentAction(rawToken: string): Promise<{ error?: string } | void> {
  const [locale] = await Promise.all([getLocale(), getMessages()]);
  const token = z.string().regex(PAY_TOKEN).safeParse(rawToken);
  if (!token.success) return; // как и для неизвестного токена
  const outcome = await v1WebAction({
    section: "orders",
    locale,
    viaApi: async (api): Promise<{ ok: true; claimed: boolean; token: string | null } | { ok: false; error: string }> => {
      try {
        const res = await api.webPayClaim({ body: { token: token.data, locale } });
        return { ok: true, claimed: res.claimed, token: res.token };
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 429) {
          return { ok: false, error: err.message };
        }
        throw err;
      }
    },
    // Лимит — там, где выполняется действие: здесь (сервер с БД) или в обработчике API v1 (webPayClaim).
  });
  // Лимит — с текстом, как у сертификата: иначе кнопка «Я оплатил(а)» молча ничего не делает.
  if (!outcome.ok) return { error: outcome.error };
  if (!outcome.claimed || !outcome.token) return;
  return lredirect(`/pay/${outcome.token}`);
}
