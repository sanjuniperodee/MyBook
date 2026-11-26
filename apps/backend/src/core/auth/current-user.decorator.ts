import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { CurrentUser as User } from "@/modules/identity";

/** Вошедший пользователь маршрута с auth: user (его кладёт SessionGuard). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  const user = ctx.switchToHttp().getRequest<FastifyRequest>().user;
  if (!user) throw new Error("CurrentUser: маршрут без входа (auth: none)");
  return user;
});
