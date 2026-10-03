import type { Clock, Logger, UnitOfWork } from "@/shared/application";
import { getFile } from "@/shared/infrastructure/storage";
import { ReviewsService, type StaffAlerts, type ThankYouPromos } from "./application";
import { drizzleOrderLookup, storagePhotos, thankYouCode } from "./infrastructure/adapters";
import { DrizzleFeedbackQueries, DrizzleReviewRepository } from "./infrastructure/persistence";

export { FeedbackError, AGGREGATE_MIN_COUNT, LOW_RATING, PUBLIC_TEXT_MIN, RATING_MAX, TEXT_MAX, NAME_MAX, CITY_MAX, THANK_YOU, canReview, type ReviewStatus } from "./domain";
export type { ModerationAction, PhotoChange } from "./application";
export type { PublicReview, StaffReview } from "./infrastructure/persistence";
export { reviewToken, reviewUrl, verifyReviewToken } from "./infrastructure/adapters";

/** Публичный фасад контекста «Отзывы»: отзыв клиента о книге, благодарность автору, модерация и витрина. */
export class FeedbackModule {
  readonly reviews: ReviewsService;
  readonly queries = new DrizzleFeedbackQueries();

  /** Файл фото отзыва — права проверяет вызывающий через queries.photo(). */
  photoFile(key: string) {
    return getFile(key);
  }

  constructor(deps: { uow: UnitOfWork; clock: Clock; logger: Logger; promos: ThankYouPromos; alerts: StaffAlerts }) {
    this.reviews = new ReviewsService(new DrizzleReviewRepository(), drizzleOrderLookup, storagePhotos, deps.promos, thankYouCode, deps.alerts, deps.uow, deps.clock, deps.logger);
  }
}
