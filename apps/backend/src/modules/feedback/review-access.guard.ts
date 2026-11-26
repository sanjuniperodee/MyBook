import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiError } from "../../core/errors/api-error";
import { REVIEW_ORDERS, type ReviewOrders } from "./feedback.tokens";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Отзыв к заказу оставляет только владелец заказа (ссылка из письма без входа — на сайте, не в API). Чужой, несуществующий
 * или кривой номер — одинаково 404: не раскрываем, есть ли такой заказ.
 */
@Injectable()
export class ReviewAccessGuard implements CanActivate {
  constructor(@Inject(REVIEW_ORDERS) private readonly orders: ReviewOrders) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const { orderId = "" } = req.params as { orderId?: string };
    const order = req.user && UUID.test(orderId) ? await this.orders.find(orderId) : null;
    if (!order || order.userId !== req.user?.id) throw new ApiError(404, "reviewNotFound");
    return true;
  }
}
