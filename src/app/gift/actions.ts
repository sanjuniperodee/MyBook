"use server";

import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { isLocale } from "@/i18n/config";
import { z } from "zod";

import { toIsoDay } from "@/lib/occasions";
import { queueEvent } from "@/web/track";
import { ApiClientError } from "@mybook/contracts";
import { ensureCatalog } from "@/web/catalog";
import { v1WebAction } from "@/web/api";
import { getVisiblePlans, type PlanId } from "@/config/site";

export interface GiftFormState {
  error?: string;
}

type GiftErrors = Awaited<ReturnType<typeof getMessages>>["gift"]["form"]["errors"];
const schema = (e: GiftErrors) =>
  z.object({
    plan: z.enum(getVisiblePlans().map((p) => p.id) as [PlanId, ...PlanId[]]),
    buyerName: z.string().trim().min(1, e.buyerName).max(60),
    buyerEmail: z.string().trim().toLowerCase().email(e.buyerEmail),
    buyerPhone: z.string().trim().max(30).optional().default(""),
    recipientName: z.string().trim().min(1, e.recipientName).max(60),
    delivery: z.enum(["me", "email"]),
    recipientEmail: z.string().trim().toLowerCase().email(e.recipientEmail).optional().or(z.literal("")),
    sendAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
    message: z.string().trim().max(400).optional().default(""),
    locale: z.string().refine(isLocale).default("ru"),
    consent: z.literal("on", { message: e.consent }),
  });

export async function createGiftAction(_: GiftFormState, form: FormData): Promise<GiftFormState> {
  await ensureCatalog();
  const e = (await getMessages()).gift.form.errors;
  const parsed = schema(e).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const locale = isLocale(d.locale) ? d.locale : "ru";
  if (d.delivery === "email" && !d.recipientEmail) return { error: e.needEmail };
  if (d.sendAt && d.sendAt < toIsoDay(new Date())) return { error: e.pastDate };
  const buyerLocale = await getLocale();
  const body = {
    plan: d.plan,
    buyerName: d.buyerName,
    buyerEmail: d.buyerEmail,
    buyerPhone: d.buyerPhone,
    recipientName: d.recipientName,
    recipientEmail: d.delivery === "email" ? d.recipientEmail || null : null,
    sendAt: d.delivery === "email" && d.sendAt ? d.sendAt : null,
    message: d.message,
    locale,
    buyerLocale,
  };
  // Лимит — там, где выполняется покупка: здесь (сервер с БД) или в обработчике API v1 (webGiftCreate).
  const outcome = await v1WebAction({
    section: "public",
    locale: buyerLocale,
    viaApi: async (api) => {
      try {
        return await api.webGiftCreate({ body });
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 429) return { ok: false as const, error: "tooMany" as const };
        throw err;
      }
    },
  });
  if (!outcome.ok) return { error: outcome.error === "tooMany" ? e.tooMany : e.pastDate };
  await queueEvent("gift_checkout", outcome.amount);
  return lredirect(`/gift/${outcome.token}`);
}

/** Покупатель сообщил об оплате переводом. */
export async function claimGiftPaymentAction(rawToken: string): Promise<{ error?: string } | void> {
  // Токен сертификата — 24 знака base64url (randomBytes(18)); мусор до базы не доходит.
  const token = z.string().regex(/^[\w-]{16,64}$/).safeParse(rawToken);
  if (!token.success) return; // как и для неизвестного токена
  const tooMany = { error: (await getMessages()).common.errors.tooMany };
  // Кнопку «Я оплатил(а)» нажимают по ссылке из письма без входа: лимит не даёт перебирать токены. Упёрлись в лимит —
  // покупатель видит, почему ничего не произошло, а не немую кнопку. Лимит — там, где выполняется действие.
  const outcome = await v1WebAction({
    section: "public",
    viaApi: async (api) => {
      try {
        return await api.webGiftClaim({ body: { token: token.data } });
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 429) return null;
        throw err;
      }
    },
  });
  if (!outcome) return tooMany;
  if (!outcome.token) return;
  return lredirect(`/gift/${outcome.token}`);
}
