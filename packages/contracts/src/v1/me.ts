/**
 * Аккаунт и приложение в API v1: телефон для push (клиентское «MyBooks»), настройки приложения (адреса политики и
 * оферты). Требования App Store и Google Play к выпуску.
 */
import { z } from "zod";
import { Ok, route, schemas, type RouteDef } from "./core";

/** Токен устройства: APNs (hex) или FCM (буквы, цифры, «:», «-», «_»). */
const DeviceToken = z.string().regex(/^[A-Za-z0-9:_-]{32,4096}$/);

export const DeviceBody = z
  .object({
    platform: z.enum(["ios", "android"]),
    token: DeviceToken,
    /** APNs: сборки из Xcode и TestFlight-разработки — sandbox, App Store и TestFlight — production. */
    environment: z.enum(["production", "sandbox"]).default("production"),
  })
  .strict()
  .register(schemas, { id: "DeviceBody" });

export const DeviceForgetBody = z.object({ token: DeviceToken }).strict().register(schemas, { id: "DeviceForgetBody" });

/** serverReady — ключ push на сервере задан: уведомления уйдут (иначе — только внутри открытого приложения). */
export const DeviceRegistered = z.object({ ok: z.literal(true), serverReady: z.boolean() }).register(schemas, { id: "DeviceRegistered" });

export const AppConfig = z
  .object({
    /** Политика конфиденциальности и оферта — полные адреса на языке пользователя. */
    privacyUrl: z.string(),
    termsUrl: z.string(),
  })
  .register(schemas, { id: "AppConfig" });

export const meRoutes = {
  meDevicePut: route({ method: "PUT", path: "/api/v1/me/devices", auth: "user", tag: "me", summary: "Телефон для push клиентского «MyBooks»: ответ менеджера, заказ, оплата, письмо близкого", body: DeviceBody, response: DeviceRegistered }),
  meDeviceDelete: route({ method: "POST", path: "/api/v1/me/devices/forget", auth: "user", tag: "me", summary: "Забыть телефон (выход из аккаунта)", body: DeviceForgetBody, response: Ok }),
  appConfig: route({ method: "GET", path: "/api/v1/app-config", auth: "none", tag: "me", summary: "Настройки приложения: адреса политики конфиденциальности и оферты (locale=ru|kk)", query: z.object({ locale: z.enum(["ru", "kk"]).optional() }), response: AppConfig }),
} as const satisfies Record<string, RouteDef>;
