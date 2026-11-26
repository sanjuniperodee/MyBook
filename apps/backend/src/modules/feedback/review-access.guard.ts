import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiError } from "../../core/errors/api-error";
import { REVIEW_ORDERS, type ReviewOrders } from "./feedback.tokens";

/**
 * Отзыв к заказу оставляет только владелец заказа (ссылка из письма без входа — на сайте, не в API). Чужой и
 * несуществующий заказ — одинаково 404: не раскрываем, есть ли такой. Номер уже проверен схемой контракта (uuid).
 */
@Injectable()
export class ReviewAccessGuard implements CanActivate {
  constructor(@Inject(REVIEW_ORDERS) private readonly orders: ReviewOrders) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const { orderId } = req.contractInput as { orderId: string };
    const order = req.user ? await this.orders.find(orderId) : null;
    if (!order || order.userId !== req.user?.id) throw new ApiError(404, "reviewNotFound");
    return true;
  }
}
