import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { requestLocale } from "./request";

const request = (ctx: ExecutionContext) => ctx.switchToHttp().getRequest<FastifyRequest>();

/** Вход маршрута контракта: параметры пути, строка запроса, тело (`body`) и файлы (`files`) — уже разобранные схемами. */
export const Input = createParamDecorator((_: unknown, ctx: ExecutionContext) => request(ctx).contractInput);

/** Язык запроса (ru, kk, uz, en) — для текстов ответа. */
export const RequestLocale = createParamDecorator((_: unknown, ctx: ExecutionContext) => requestLocale(request(ctx)));
