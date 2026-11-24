/** Вход по API v1: почта или телефон + пароль (клиент и сотрудник), второй шаг сотрудника, выход, «кто я». */
import { z } from "zod";
import { Ok, iso, route, schemas, uuid, type RouteDef } from "./core";

export const User = z
  .object({
    id: uuid,
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    locale: z.enum(["ru", "kk"]),
    isStaff: z.boolean(),
  })
  .register(schemas, { id: "User" });

export const Session = z
  .object({
    /** Токен сессии: Authorization: Bearer <token>. Веб получает тот же токен в cookie mb_session. */
    token: z.string(),
    expiresAt: iso,
    user: User,
  })
  .register(schemas, { id: "Session" });

/** Ответ входа: сессия или второй шаг (сотрудник с 2FA) — билет на 5 минут для auth2fa. */
export const LoginResult = z
  .object({
    session: Session.nullable(),
    secondFactorTicket: z.string().nullable(),
  })
  .register(schemas, { id: "LoginResult" });

export const LoginBody = z
  .object({
    /** Почта или телефон — как на сайте. */
    login: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(200),
  })
  .register(schemas, { id: "LoginBody" });

export const SecondFactorBody = z.object({ ticket: z.string().min(10).max(300), code: z.string().trim().min(4).max(40) }).register(schemas, { id: "SecondFactorBody" });

/**
 * Сессия для встроенного браузера приложения: разделы сайта, которых нет в API (оформление заказа и оплата, обложка),
 * открываются уже вошедшими — cookie `cookie`=`token` на домене сайта. Отдельный токен на 12 часов.
 */
export const WebSession = z.object({ cookie: z.string(), token: z.string(), expiresAt: iso, baseUrl: z.string() }).register(schemas, { id: "WebSession" });

export const authRoutes = {
  authLogin: route({ method: "POST", path: "/api/v1/auth/login", auth: "none", tag: "auth", summary: "Вход по почте или телефону и паролю (клиент и сотрудник)", body: LoginBody, response: LoginResult }),
  authSecondFactor: route({ method: "POST", path: "/api/v1/auth/2fa", auth: "none", tag: "auth", summary: "Второй шаг входа сотрудника: код из приложения-аутентификатора", body: SecondFactorBody, response: Session }),
  authLogout: route({ method: "POST", path: "/api/v1/auth/logout", auth: "user", tag: "auth", summary: "Выход: сессия токена закрывается", response: Ok }),
  authWebSession: route({ method: "POST", path: "/api/v1/auth/web-session", auth: "user", tag: "auth", summary: "Сессия для встроенного браузера: оформление и оплата заказа на сайте (/books/{id}/checkout, /orders/{id})", response: WebSession }),
  me: route({ method: "GET", path: "/api/v1/me", auth: "user", tag: "auth", summary: "Кто вошёл", response: User }),
} as const satisfies Record<string, RouteDef>;
