import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import { isLocale, type Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import type { RateLimiter } from "@/shared/application/RateLimiter";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { RATE_LIMITER } from "../../core/kernel/tokens";
import { PublicService } from "./public.service";

/**
 * 13 контрактных маршрутов Контекста 3 («Публичное и маркетинг», `/api/v1/web/*`):
 * каталог, подвал, витрина отзывов, приглашение, подарочные сертификаты, активация кода,
 * приглашение написать письмо, отзыв по ссылке, отписка и страница QR-файла ответа.
 */
@Controller()
export class WebPublicController {
  constructor(
    @Inject(PublicService) private readonly service: PublicService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  @Endpoint("webAnswerFilePage")
  answerFilePage(@Input() input: Parsed<"webAnswerFilePage">): Promise<Output<"webAnswerFilePage">> {
    return this.service.answerFilePage(input.token);
  }

  @Endpoint("webSiteCatalog")
  siteCatalog(): Promise<Output<"webSiteCatalog">> {
    return this.service.siteCatalog();
  }

  @Endpoint("webSiteChrome")
  siteChrome(): Promise<Output<"webSiteChrome">> {
    return this.service.siteChrome();
  }

  @Endpoint("webReviewsShowcase")
  reviewsShowcase(@Input() input: Parsed<"webReviewsShowcase">): Promise<Output<"webReviewsShowcase">> {
    return this.service.reviewsShowcase(input.limit ?? 6, input.theme);
  }

  @Endpoint("webInviteWelcome")
  inviteWelcome(@Input() input: Parsed<"webInviteWelcome">): Promise<Output<"webInviteWelcome">> {
    return this.service.inviteWelcome(input.code);
  }

  @Endpoint("webGiftStatus")
  async giftStatus(@Input() input: Parsed<"webGiftStatus">, @RequestLocale() reqLocale: Locale): Promise<Output<"webGiftStatus">> {
    const locale = isLocale(input.locale) ? input.locale : reqLocale;
    const gift = await this.service.giftStatus(input.token, messagesFor(locale));
    if (!gift) throw new ApiError(404, "invoiceNotFound");
    return gift;
  }

  @Endpoint("webGiftCreate")
  async giftCreate(
    @Input() input: Parsed<"webGiftCreate">,
    @SessionToken() sessionTok: string | null,
    @Req() req: FastifyRequest,
  ): Promise<Output<"webGiftCreate"> | Response> {
    const ip = clientIp(req, this.config.edgeIpSecret);
    // Каждая покупка — письмо и счёт: не даём засыпать ими; ответ 429 на языке формы покупателя.
    if (!(await this.limiter.hit(`gift:${ip}`, 10, 60 * 60_000))) {
      return Response.json({ error: messagesFor(input.body.buyerLocale).gift.form.errors.tooMany, code: "tooMany" }, { status: 429 });
    }
    return this.service.giftCreate(input.body, sessionTok);
  }

  @Endpoint("webGiftClaim")
  async giftClaim(
    @Input() input: Parsed<"webGiftClaim">,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
  ): Promise<Output<"webGiftClaim"> | Response> {
    const ip = clientIp(req, this.config.edgeIpSecret);
    // Кнопку жмут по ссылке из письма без входа: лимит не даёт перебирать токены.
    if (!(await this.limiter.hit(`gift-claim:${ip}`, 20, 600_000))) {
      return Response.json({ error: messagesFor(locale).common.errors.tooMany, code: "tooMany" }, { status: 429 });
    }
    return this.service.giftClaim(input.body.token);
  }

  @Endpoint("webRedeemCheck")
  redeemCheck(@Input() input: Parsed<"webRedeemCheck">): Promise<Output<"webRedeemCheck">> {
    return this.service.redeemCheck(input.code);
  }

  @Endpoint("webLetterInvite")
  async letterInvite(@Input() input: Parsed<"webLetterInvite">): Promise<Output<"webLetterInvite">> {
    const book = await this.service.letterInvite(input.token);
    if (!book) throw new ApiError(404, "letterNotFound");
    return book;
  }

  @Endpoint("webReviewPage")
  async reviewPage(@Input() input: Parsed<"webReviewPage">, @SessionToken() sessionTok: string | null): Promise<Output<"webReviewPage">> {
    const page = await this.service.reviewPage(input.orderId, input.t ?? null, sessionTok);
    if (!page) throw new ApiError(404, "reviewNotFound");
    return page;
  }

  @Endpoint("webUnsubscribeLink")
  unsubscribeLink(@Input() input: Parsed<"webUnsubscribeLink">): Output<"webUnsubscribeLink"> {
    return this.service.unsubscribeLink(input.u ?? "", input.t ?? "");
  }

  @Endpoint("webUnsubscribe")
  unsubscribe(@Input() input: Parsed<"webUnsubscribe">): Promise<Output<"webUnsubscribe">> {
    return this.service.unsubscribe(input.body.u, input.body.t);
  }
}
