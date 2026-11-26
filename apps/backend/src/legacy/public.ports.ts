import type { Provider } from "@nestjs/common";
import { env } from "@/config/env";
import { isOnlinePayment, redeemUrl } from "@/modules/ordering";
import { publicFile } from "@/server/answerFiles";
import { readCatalogSettings, syncCatalogFromSettings } from "@/server/catalog";
import type { Container } from "@/server/container";
import { kaspiPaymentProps } from "@/server/kaspi-view";
import { manualPaymentProps } from "@/server/requisites";
import { PUBLIC_PORTS, type PublicPorts } from "../modules/public/public.tokens";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/**
 * Адаптер портов Контекста 3 к старому контейнеру и модулям `src/server/*` (без единого вызова `next/headers`).
 */
export const legacyPublicPorts: Provider<PublicPorts> = {
  provide: PUBLIC_PORTS,
  useFactory: (c: Container): PublicPorts => ({
    readCatalogSettings: () => readCatalogSettings(),
    ensureCatalog: () => syncCatalogFromSettings(),
    widgetConfig: () => c.messaging.widgetConfig(),
    shopWhatsapp: () => c.marketing.service.shopWhatsapp(),
    reviewsShowcase: (limit, theme) => c.feedback.queries.showcase(limit, theme),
    reviewsSummary: (theme) => c.feedback.queries.summary(theme),
    reviewPhoto: (reviewId) => c.feedback.queries.photo(reviewId),
    reviewPhotoFile: (key) => c.feedback.photoFile(key),
    orderDetails: async (orderId) => (await c.ordering.queries.orderDetails(orderId)) ?? null,
    isOrderOwner: async (orderId, userId) => Boolean(await c.ordering.queries.ownedOrderDetails(orderId, userId)),
    openReview: (orderId) => c.feedback.reviews.open(orderId),
    submitReview: async (orderId, input, photo) => {
      const review = await c.feedback.reviews.submit(orderId, input, photo);
      return { status: review.status, thankYouCode: review.thankYouCode, hasPhoto: Boolean(review.photo) };
    },
    inviteWelcome: (code) => c.referrals.service.welcome(code),
    followShortLink: (slug, userAgent) => c.marketing.service.follow(slug, userAgent),
    giftByToken: async (token) => (await c.ordering.queries.giftByToken(token)) ?? null,
    giftPaymentProps: async (giftId, buyerPhone, messages) => {
      const [kaspi, manual] = await Promise.all([
        kaspiPaymentProps({ kind: "gift", id: giftId }, buyerPhone),
        manualPaymentProps(messages),
      ]);
      return {
        online: isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null,
        manual,
        kaspi,
      };
    },
    redeemUrl: (code, locale) => redeemUrl(code, locale),
    purchaseGift: async (input) => {
      const gift = await c.ordering.gifts.purchase(input);
      return { token: gift.token, amount: gift.amount };
    },
    claimGiftPayment: async (token) => {
      const gift = await c.ordering.gifts.claimPayment(token);
      return gift ? { token: gift.token } : null;
    },
    checkPromo: (code) => c.ordering.promos.check(code),
    giftByPromo: async (promoId) => (await c.ordering.queries.giftByPromo(promoId)) ?? null,
    giftPdf: (token) => c.ordering.giftPdf(token),
    bookByInviteToken: async (token) => (await c.authoring.queries.bookByInviteToken(token)) ?? null,
    submitLetter: async (token, input) => {
      await c.authoring.letters.submit(token, input);
    },
    isValidUnsubscribeLink: (userId, token) => c.notifications.subscriptions.isValidLink(userId, token),
    unsubscribe: async (userId, token) => {
      await c.notifications.subscriptions.unsubscribe(userId, token);
    },
    publicAnswerFile: (token) => publicFile(token),
    siteMessages: (token, after) => c.messaging.siteMessages(token, after),
    postSiteChat: (input) => c.messaging.site.post(input),
    requestCallback: async (input) => {
      await c.messaging.site.requestCallback(input);
    },
    calendarFeed: (token) => c.boards.calendar.feed(token),
    chatAvatarFile: (file) => c.messaging.avatarFile(file),
  }),
  inject: [LEGACY_CONTAINER],
};
