import { Controller, Inject, UseGuards } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { FeedbackModule as FeedbackContext } from "@/modules/feedback";
import { toReviewDto } from "@/modules/feedback/ui/reviewView";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { RateLimit, type RateLimitPolicy } from "../../core/rate-limit/rate-limit";
import { FEEDBACK } from "./feedback.tokens";
import { ReviewAccessGuard } from "./review-access.guard";
import { ReviewViewQuery } from "./review-view.query";

/** Отправки отзыва и фото — как у сайта и mybook-api (тот же ключ: счётчик общий на оба процесса). */
const SUBMITS: RateLimitPolicy = { key: "review", limit: 20, windowMs: 3_600_000, error: "reviewRate" };

/** Отзыв к своему заказу: правила, промокод-благодарность и сигнал о низкой оценке — в ReviewsService контекста. */
@Controller()
@UseGuards(ReviewAccessGuard)
export class ReviewsController {
  constructor(
    @Inject(FEEDBACK) private readonly feedback: FeedbackContext,
    @Inject(ReviewViewQuery) private readonly screen: ReviewViewQuery,
  ) {}

  @Endpoint("reviewGet")
  get(@Input() input: Parsed<"reviewGet">, @RequestLocale() locale: Locale): Promise<Output<"reviewGet">> {
    return this.screen.view(input.orderId, locale);
  }

  @Endpoint("reviewSubmit")
  @RateLimit(SUBMITS)
  async submit(@Input() input: Parsed<"reviewSubmit">): Promise<Output<"reviewSubmit">> {
    return toReviewDto(await this.feedback.reviews.submit(input.orderId, input.body, "keep"));
  }

  @Endpoint("reviewPhotoSet")
  @RateLimit(SUBMITS)
  async setPhoto(@Input() input: Parsed<"reviewPhotoSet">): Promise<Output<"reviewPhotoSet">> {
    const [file] = input.files;
    if (!file) throw new ApiError(400, "badRequest");
    return toReviewDto(await this.feedback.reviews.setPhoto(input.orderId, { file: Buffer.from(await file.arrayBuffer()) }));
  }

  @Endpoint("reviewPhotoDelete")
  async removePhoto(@Input() input: Parsed<"reviewPhotoDelete">): Promise<Output<"reviewPhotoDelete">> {
    return toReviewDto(await this.feedback.reviews.setPhoto(input.orderId, "remove"));
  }
}
