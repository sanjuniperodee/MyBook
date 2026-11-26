import type { FastifyRequest } from "fastify";
import type { CurrentUser } from "@/modules/identity";
import { cookie, header } from "../http/request";

/** Кто вошёл по токену сессии (src/modules/identity: SessionReader). */
export interface SessionUsers {
  user(token: string): Promise<CurrentUser | null>;
}

export const SESSION_USERS = Symbol("SessionUsers");

const SESSION_COOKIE = "mb_session";
const BEARER = /^Bearer ([A-Za-z0-9_-]{20,200})$/;

/** Токен сессии: cookie браузера, а у мобильного приложения — Authorization: Bearer (тот же токен из таблицы sessions). */
export function sessionToken(req: FastifyRequest): string | null {
  return cookie(req, SESSION_COOKIE) ?? header(req, "authorization")?.match(BEARER)?.[1] ?? null;
}
