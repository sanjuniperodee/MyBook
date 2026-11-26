import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { sessionToken } from "../auth/session";
import { requestLocale } from "./request";

const request = (ctx: ExecutionContext) => ctx.switchToHttp().getRequest<FastifyRequest>();

/** Вход маршрута контракта: параметры пути, строка запроса, тело (`body`) и файлы (`files`) — уже разобранные схемами. */
export const Input = createParamDecorator((_: unknown, ctx: ExecutionContext) => request(ctx).contractInput);

/** Язык запроса (ru, kk, uz, en) — для текстов ответа. */
export const RequestLocale = createParamDecorator((_: unknown, ctx: ExecutionContext) => requestLocale(request(ctx)));

/** Токен сессии из cookie `mb_session` или `Authorization: Bearer ...` (или `null`, если не передан). */
export const SessionToken = createParamDecorator((_: unknown, ctx: ExecutionContext) => sessionToken(request(ctx)));
