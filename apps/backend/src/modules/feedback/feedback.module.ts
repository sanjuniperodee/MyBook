import { Module } from "@nestjs/common";
import { FeedbackModule as FeedbackContext } from "@/modules/feedback";
import { consoleLogger, type Clock, type UnitOfWork } from "@/shared/application";
import { CLOCK, UNIT_OF_WORK } from "../../core/kernel/tokens";
import { FEEDBACK, FEEDBACK_PORTS, REVIEW_ORDERS, type FeedbackPorts } from "./feedback.tokens";
import { ReviewAccessGuard } from "./review-access.guard";
import { orderingReviewOrders } from "./review-orders.adapter";
import { ReviewViewQuery } from "./review-view.query";
import { ReviewsController } from "./reviews.controller";

/**
 * Контекст Feedback (отзывы) в бэкенде на Nest: сборка его сервисов из src/modules/feedback с портами процесса и
 * HTTP-слой /api/v1/orders/{orderId}/review*. Предметная область — без изменений и без декораторов (ADR 0014, правило 1).
 */
@Module({
  controllers: [ReviewsController],
  providers: [
    {
      provide: FEEDBACK,
      useFactory: (uow: UnitOfWork, clock: Clock, ports: FeedbackPorts) => new FeedbackContext({ uow, clock, logger: consoleLogger("feedback"), ...ports }),
      inject: [UNIT_OF_WORK, CLOCK, FEEDBACK_PORTS],
    },
    { provide: REVIEW_ORDERS, useFactory: () => orderingReviewOrders() },
    ReviewAccessGuard,
    ReviewViewQuery,
  ],
})
export class FeedbackApiModule {}
