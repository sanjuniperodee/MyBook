/**
 * Публичные страницы сайта в API v1 (ADR 0012, Раздел 4, section: "public"): делегируют сборщикам
 * `src/server/v1-local-bridge-public.ts` — тем же, что зовёт сайт с БД. Лимиты частоты — здесь, как в действиях сайта.
 */
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { HttpError } from "@/server/api";
import { getCurrentUser } from "@/server/auth";
import { rateLimit, trustedClientIp } from "@/server/rateLimit";
import {
  localGiftClaim,
  localGiftCreate,
  localGiftStatus,
  localInviteWelcome,
  localLetterInvite,
  localRedeemCheck,
  localReviewPage,
  localReviewsShowcase,
  localSiteCatalog,
  localSiteChrome,
  localUnsubscribe,
  localUnsubscribeLink,
} from "@/server/v1-local-bridge-public";
import type { Handlers } from "../app";

async function resolveLocale(raw?: string): Promise<Locale> {
  if (isLocale(raw)) return raw;
  const fromReq = await getLocale();
  return isLocale(fromReq) ? fromReq : "ru";
}

export const webPublicHandlers: Pick<
  Handlers,
  | "webSiteCatalog"
  | "webSiteChrome"
  | "webReviewsShowcase"
  | "webInviteWelcome"
  | "webGiftStatus"
  | "webGiftCreate"
  | "webGiftClaim"
  | "webRedeemCheck"
  | "webLetterInvite"
  | "webReviewPage"
  | "webUnsubscribeLink"
  | "webUnsubscribe"
> = {
  webSiteCatalog: () => localSiteCatalog(),

  webSiteChrome: () => localSiteChrome(),

  webReviewsShowcase: ({ input }) => localReviewsShowcase(input.limit ?? 6, input.theme),

  webInviteWelcome: ({ input }) => localInviteWelcome(input.code),

  async webGiftStatus({ input }) {
    const gift = await localGiftStatus(input.token, messagesFor(await resolveLocale(input.locale)));
    if (!gift) throw new HttpError(404, "invoiceNotFound");
    return gift;
  },

  async webGiftCreate({ input }) {
    // Каждая покупка — письмо и счёт: не даём засыпать ими (как в действии сайта).
    if (!(await rateLimit(`gift:${await trustedClientIp()}`, 10, 60 * 60_000))) {
      return Response.json({ error: messagesFor(input.body.buyerLocale).gift.form.errors.tooMany, code: "tooMany" }, { status: 429 });
    }
    const user = await getCurrentUser();
    return localGiftCreate(input.body, user?.id ?? null);
  },

  async webGiftClaim({ input }) {
    // Кнопку жмут по ссылке из письма без входа: лимит не даёт перебирать токены (как в действии сайта).
    if (!(await rateLimit(`gift-claim:${await trustedClientIp()}`, 20, 600_000))) {
      return Response.json({ error: messagesFor(await resolveLocale()).common.errors.tooMany, code: "tooMany" }, { status: 429 });
    }
    return localGiftClaim(input.body.token);
  },

  webRedeemCheck: ({ input }) => localRedeemCheck(input.code),

  async webLetterInvite({ input }) {
    const book = await localLetterInvite(input.token);
    if (!book) throw new HttpError(404, "letterNotFound");
    return book;
  },

  async webReviewPage({ input }) {
    const page = await localReviewPage(input.orderId, input.t ?? null);
    if (!page) throw new HttpError(404, "reviewNotFound");
    return page;
  },

  webUnsubscribeLink: ({ input }) => localUnsubscribeLink(input.u ?? "", input.t ?? ""),

  webUnsubscribe: ({ input }) => localUnsubscribe(input.body.u, input.body.t),
};
