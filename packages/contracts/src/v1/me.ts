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

/** Удаление аккаунта: что удалится и что останется — строки на языке пользователя (один текст с кабинетом сайта). */
export const DeletionInfo = z
  .object({
    /** Чем подтверждать удаление. Сейчас у клиентов только пароль. */
    confirm: z.enum(["password"]),
    items: z.array(z.string()),
    /** Что останется: заказы в работе (доставим, затем удалим) и учёт без контактов. */
    kept: z.array(z.string()),
    /** Номера заказов в работе. */
    keptOrders: z.array(z.number().int()),
  })
  .register(schemas, { id: "DeletionInfo" });

export const DeleteAccountBody = z.object({ password: z.string().min(1).max(200) }).strict().register(schemas, { id: "DeleteAccountBody" });

/** Аккаунт удалён: сессия закрыта (токен больше не действует); kept — что ещё останется до доставки. */
export const AccountDeleted = DeletionInfo.extend({ ok: z.literal(true) }).register(schemas, { id: "AccountDeleted" });

const LocaleQuery = z.object({ locale: z.enum(["ru", "kk", "uz", "en"]).optional() });

export const meRoutes = {
  meDevicePut: route({ method: "PUT", path: "/api/v1/me/devices", auth: "user", tag: "me", summary: "Телефон для push клиентского «MyBooks»: ответ менеджера, заказ, оплата, письмо близкого", body: DeviceBody, response: DeviceRegistered }),
  meDeviceDelete: route({ method: "POST", path: "/api/v1/me/devices/forget", auth: "user", tag: "me", summary: "Забыть телефон (выход из аккаунта)", body: DeviceForgetBody, response: Ok }),
  meDeletionInfo: route({ method: "GET", path: "/api/v1/me/deletion", auth: "user", tag: "me", summary: "Удаление аккаунта: что удалится, что останется (заказы в работе), чем подтверждать", query: LocaleQuery, response: DeletionInfo }),
  meDelete: route({
    method: "POST",
    path: "/api/v1/me/delete",
    auth: "user",
    tag: "me",
    summary: "Удалить аккаунт навсегда (подтверждение паролем; 400 wrongPassword, 403 staffAccount). Заказ в работе доставим, затем дочистим",
    query: LocaleQuery,
    body: DeleteAccountBody,
    response: AccountDeleted,
  }),
  appConfig: route({ method: "GET", path: "/api/v1/app-config", auth: "none", tag: "me", summary: "Настройки приложения: адреса политики конфиденциальности и оферты (locale=ru|kk)", query: z.object({ locale: z.enum(["ru", "kk"]).optional() }), response: AppConfig }),
} as const satisfies Record<string, RouteDef>;
