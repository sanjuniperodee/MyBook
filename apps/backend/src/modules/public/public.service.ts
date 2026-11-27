import { Inject, Injectable } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import { site } from "@/config/site";
import { isLocale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { FILE_TOKEN } from "@/lib/book/answer-files";
import { verifyReviewToken } from "@/modules/feedback";
import { AGGREGATE_MIN_COUNT, FeedbackError } from "@/modules/feedback/domain";
import type { CurrentUser } from "@/modules/identity";
import { OrderingError } from "@/modules/ordering/domain";
import { consoleLogger } from "@/shared/application";
import { isAdLanding, isLandingCode, LANDING_FIELD_MAX, landingDevice } from "@/shared/domain/landing";
import {
  GIFT_CLAIM_TOKEN_RE,
  INVITE_CODE_RE,
  LETTER_INVITE_TOKEN_RE,
  toGiftStatusDto,
  toLetterInviteDto,
  toPublicAnswerFileDto,
  toRedeemCheckDto,
  toReviewPageDto,
  toReviewsShowcaseDto,
  UUID_RE,
} from "@/shared/public-routes";
import { SESSION_USERS, type SessionUsers } from "../../core/auth/session";
import { PUBLIC_PORTS, type PublicPorts } from "./public.tokens";

const log = consoleLogger("reviews");

/**
 * Прикладной слой Контекста 3 («Публичное и маркетинг»): сборка публичных экранов сайта,
 * проверка доступа по токену/сессии без next/headers и обработка ошибок смежных контекстов.
 */
@Injectable()
export class PublicService {
  constructor(
    @Inject(PUBLIC_PORTS) private readonly ports: PublicPorts,
    @Inject(SESSION_USERS) private readonly sessions: SessionUsers,
  ) {}

  optionalUser(token: string | null): Promise<CurrentUser | null> {
    return token ? this.sessions.user(token) : Promise.resolve(null);
  }

  async answerFilePage(token: string): Promise<Output<"webAnswerFilePage">> {
    if (!FILE_TOKEN.test(token)) return { found: null };
    return toPublicAnswerFileDto(await this.ports.publicAnswerFile(token));
  }

  siteCatalog(): Promise<Output<"webSiteCatalog">> {
    return this.ports.readCatalogSettings();
  }

  async siteChrome(): Promise<Output<"webSiteChrome">> {
    const [widget, digits] = await Promise.all([
      this.ports.widgetConfig().catch(() => null),
      this.ports.shopWhatsapp().catch(() => site.contacts.whatsapp.replace(/\D/g, "")),
    ]);
    return {
      widget: widget ? { enabled: widget.enabled, chat: widget.chat, whatsapp: widget.whatsapp } : null,
      shopWhatsappDigits: digits,
    };
  }

  async reviewsShowcase(limit: number, theme?: string): Promise<Output<"webReviewsShowcase">> {
    try {
      const [reviews, summary] = await Promise.all([this.ports.reviewsShowcase(limit, theme), this.ports.reviewsSummary(theme)]);
      return toReviewsShowcaseDto(reviews, summary.count >= AGGREGATE_MIN_COUNT ? summary : null);
    } catch (err) {
      // Сбой базы не роняет маркетинговую страницу — витрина просто скрывается.
      log.error("site reviews", err);
      return { reviews: [], summary: null };
    }
  }

  async inviteWelcome(code: string): Promise<Output<"webInviteWelcome">> {
    if (!INVITE_CODE_RE.test(code)) return { welcome: null };
    return { welcome: await this.ports.inviteWelcome(code) };
  }

  async giftStatus(token: string, messages: Messages): Promise<Output<"webGiftStatus"> | null> {
    const gift = await this.ports.giftByToken(token);
    if (!gift) return null;
    const paid = gift.status === "paid" && !!gift.promo;
    const payment = gift.status === "pending_payment" ? await this.ports.giftPaymentProps(gift.id, gift.buyerPhone, messages) : null;
    const redeemLink = paid && gift.promo ? this.ports.redeemUrl(gift.promo.code, isLocale(gift.locale) ? gift.locale : "ru") : null;
    return toGiftStatusDto(gift, payment, redeemLink);
  }

  async giftCreate(body: Parsed<"webGiftCreate">["body"], sessionTok: string | null): Promise<Output<"webGiftCreate">> {
    await this.ports.ensureCatalog();
    const user = await this.optionalUser(sessionTok);
    try {
      const gift = await this.ports.purchaseGift({ ...body, buyerUserId: user?.id ?? null });
      return { ok: true, token: gift.token, amount: gift.amount };
    } catch (err) {
      if (OrderingError.is(err) && err.code === "giftPastDate") return { ok: false, error: "giftPastDate" };
      throw err;
    }
  }

  async giftClaim(token: string): Promise<Output<"webGiftClaim">> {
    if (!GIFT_CLAIM_TOKEN_RE.test(token)) return { token: null };
    const gift = await this.ports.claimGiftPayment(token);
    return { token: gift?.token ?? null };
  }

  async redeemCheck(code: string): Promise<Output<"webRedeemCheck">> {
    const check = await this.ports.checkPromo(code);
    if (!check.ok) return toRedeemCheckDto(check, null);
    const gift = await this.ports.giftByPromo(check.promo.id);
    return toRedeemCheckDto(check, gift);
  }

  async letterInvite(token: string): Promise<Output<"webLetterInvite"> | null> {
    if (!LETTER_INVITE_TOKEN_RE.test(token)) return null;
    const book = await this.ports.bookByInviteToken(token);
    return book ? toLetterInviteDto(book) : null;
  }

  /** Доступ к отзыву по заказу: подписанная ссылка из письма (до БД) или вошедший владелец заказа. */
  async canReviewOrder(orderId: string, token: string | null | undefined, sessionTok: string | null): Promise<boolean> {
    if (!UUID_RE.test(orderId)) return false;
    if (verifyReviewToken(orderId, token)) return true;
    const user = await this.optionalUser(sessionTok);
    if (!user) return false;
    return this.ports.isOrderOwner(orderId, user.id);
  }

  async reviewPage(orderId: string, token: string | null, sessionTok: string | null): Promise<Output<"webReviewPage"> | null> {
    if (!(await this.canReviewOrder(orderId, token, sessionTok))) return null;
    const details = await this.ports.orderDetails(orderId);
    if (!details) return null;
    let state = null;
    try {
      state = await this.ports.openReview(orderId);
    } catch (err) {
      if (!FeedbackError.is(err)) throw err;
    }
    return toReviewPageDto(details, state);
  }

  unsubscribeLink(userId: string, token: string): Output<"webUnsubscribeLink"> {
    return { valid: this.ports.isValidUnsubscribeLink(userId, token) };
  }

  async unsubscribe(userId: string, token: string): Promise<Output<"webUnsubscribe">> {
    await this.ports.unsubscribe(userId, token);
    return { ok: true };
  }

  /** Переход на рекламный лендинг: код и лендинг — только наши (иначе 400), поля обрезаны, устройство — по User-Agent. */
  async landingVisit(body: Parsed<"webLandingVisit">["body"], userAgent: string): Promise<Output<"webLandingVisit"> | null> {
    if (!isLandingCode(body.code) || !isAdLanding(body.landing)) return null;
    const f = (v: string | undefined) => (v ?? "").trim().slice(0, LANDING_FIELD_MAX);
    const ua = userAgent.slice(0, 500);
    await this.ports.recordLandingVisit(
      {
        code: body.code,
        landing: body.landing,
        utmSource: f(body.utmSource),
        utmMedium: f(body.utmMedium),
        utmCampaign: f(body.utmCampaign),
        utmContent: f(body.utmContent),
        utmTerm: f(body.utmTerm),
        fbclid: f(body.fbclid),
        fbp: f(body.fbp),
        fbc: f(body.fbc),
        campaignId: f(body.campaignId),
        adsetId: f(body.adsetId),
        adId: f(body.adId),
        placement: f(body.placement),
        referrer: f(body.referrer),
        userAgent: ua,
        ...landingDevice(ua),
      },
      body.event,
    );
    return { ok: true };
  }
}
