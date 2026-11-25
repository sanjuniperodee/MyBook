/**
 * Аккаунт и приложение в API v1: телефон для push (клиентское «MyBooks»), настройки приложения (адреса политики и
 * оферты). Требования App Store и Google Play к выпуску.
 */
import { z } from "zod";
import { Ok, route, schemas, type RouteDef } from "./core";
import { ACCOUNT_LIMITS } from "../limits";

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

export const DeviceForgetBody = z
  .object({ token: DeviceToken })
  .strict()
  .register(schemas, { id: "DeviceForgetBody" });

/** serverReady — ключ push на сервере задан: уведомления уйдут (иначе — только внутри открытого приложения). */
export const DeviceRegistered = z
  .object({ ok: z.literal(true), serverReady: z.boolean() })
  .register(schemas, { id: "DeviceRegistered" });

export const AppConfig = z
  .object({
    /** Политика конфиденциальности и оферта — полные адреса на языке пользователя. */
    privacyUrl: z.string(),
    termsUrl: z.string(),
    /** Названия документов — заголовки их страниц на сайте (legal.privacy.title, legal.offer.title). */
    labels: z.object({ privacy: z.string(), terms: z.string() }),
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
    /** Надписи экрана удаления — те же тексты, что в кабинете сайта (account-deletion.ts). */
    labels: z.object({
      title: z.string(),
      intro: z.string(),
      accounting: z.string(),
      password: z.string(),
      forgot: z.string(),
      next: z.string(),
      confirmTitle: z.string(),
      confirm: z.string(),
      cancel: z.string(),
      done: z.string(),
    }),
  })
  .register(schemas, { id: "DeletionInfo" });

export const DeleteAccountBody = z
  .object({ password: z.string().min(1).max(200) })
  .strict()
  .register(schemas, { id: "DeleteAccountBody" });

/** Аккаунт удалён: сессия закрыта (токен больше не действует); kept — что ещё останется до доставки. */
export const AccountDeleted = DeletionInfo.extend({
  ok: z.literal(true),
}).register(schemas, { id: "AccountDeleted" });

const LocaleQuery = z.object({
  locale: z.enum(["ru", "kk", "uz", "en"]).optional(),
});

/** Настройки push приложения CRM: iPhone — готов ли ключ APNs; Android — проект Firebase (без него FCM-токен не выдаётся). */
export const CrmPushConfig = z
  .object({
    ios: z.boolean(),
    android: z
      .object({
        apiKey: z.string(),
        appId: z.string(),
        projectId: z.string(),
        senderId: z.string(),
      })
      .nullable(),
  })
  .register(schemas, { id: "CrmPushConfig" });

const AccountGroup = z.object({ title: z.string(), text: z.string() });

/**
 * Аккаунт клиента — как страница «Аккаунт» кабинета сайта (/account): профиль, пароль, уведомления, язык, данные.
 * Надписи — те же тексты, что на сайте (orders.account). notice — итог последней правки (как AccountState формы сайта):
 * ok — сообщение «сохранено», иначе ошибка и поле, к которому она относится.
 */
export const AccountView = z
  .object({
    profile: z.object({
      name: z.string(),
      phone: z.string(),
      email: z.string(),
    }),
    remindersOn: z.boolean(),
    locale: z.string(),
    locales: z.array(z.object({ id: z.string(), label: z.string() })),
    limits: z.object({ name: z.number().int(), passwordMin: z.number().int() }),
    notice: z
      .object({
        ok: z.boolean(),
        text: z.string(),
        field: z.enum(["name", "phone", "current", "next"]).nullable(),
      })
      .nullable(),
    labels: z.object({
      title: z.string(),
      lead: z.string(),
      groups: z.object({
        profile: AccountGroup,
        password: AccountGroup,
        notifications: AccountGroup,
        language: AccountGroup,
        data: AccountGroup,
      }),
      email: z.string(),
      emailHint: z.string(),
      name: z.string(),
      phone: z.string(),
      save: z.string(),
      current: z.string(),
      next: z.string(),
      change: z.string(),
      languageText: z.string(),
      logout: z.string(),
      notifications: z.object({
        orderMail: z.string(),
        orderMailValue: z.string(),
        reminders: z.string(),
        on: z.string(),
        off: z.string(),
        onHint: z.string(),
        offHint: z.string(),
        turnOn: z.string(),
        turnOff: z.string(),
      }),
    }),
  })
  .register(schemas, { id: "AccountView" });

export const ProfileBody = z
  .object({
    name: z.string().max(ACCOUNT_LIMITS.name * 2),
    phone: z.string().max(40),
  })
  .strict()
  .register(schemas, { id: "ProfileBody" });
export const PasswordBody = z
  .object({ current: z.string().max(200), next: z.string().max(200) })
  .strict()
  .register(schemas, { id: "PasswordBody" });
export const RemindersBody = z
  .object({ on: z.boolean() })
  .strict()
  .register(schemas, { id: "RemindersBody" });
export const LocaleBody = z
  .object({ locale: z.enum(["ru", "kk", "uz", "en"]) })
  .strict()
  .register(schemas, { id: "LocaleBody" });

export const meRoutes = {
  meDevicePut: route({
    method: "PUT",
    path: "/api/v1/me/devices",
    auth: "user",
    tag: "me",
    summary:
      "Телефон для push клиентского «MyBooks»: ответ менеджера, заказ, оплата, письмо близкого",
    body: DeviceBody,
    response: DeviceRegistered,
  }),
  meDeviceDelete: route({
    method: "POST",
    path: "/api/v1/me/devices/forget",
    auth: "user",
    tag: "me",
    summary: "Забыть телефон (выход из аккаунта)",
    body: DeviceForgetBody,
    response: Ok,
  }),
  meAccount: route({
    method: "GET",
    path: "/api/v1/me/account",
    auth: "user",
    tag: "me",
    summary:
      "Аккаунт: профиль, напоминания, язык и все надписи страницы (как /account сайта)",
    query: LocaleQuery,
    response: AccountView,
  }),
  meProfileUpdate: route({
    method: "PATCH",
    path: "/api/v1/me/profile",
    auth: "user",
    tag: "me",
    summary: "Имя и телефон (ошибка формы — в notice)",
    body: ProfileBody,
    response: AccountView,
  }),
  mePasswordChange: route({
    method: "POST",
    path: "/api/v1/me/password",
    auth: "user",
    tag: "me",
    summary:
      "Смена пароля: остальные устройства выходят, этот остаётся (ошибка формы — в notice)",
    body: PasswordBody,
    response: AccountView,
  }),
  meRemindersSet: route({
    method: "PUT",
    path: "/api/v1/me/reminders",
    auth: "user",
    tag: "me",
    summary: "Напоминания дописать книгу: включить или выключить",
    body: RemindersBody,
    response: AccountView,
  }),
  meLocaleSet: route({
    method: "PUT",
    path: "/api/v1/me/locale",
    auth: "user",
    tag: "me",
    summary:
      "Язык писем и текстов с сервера (как переключатель языка на сайте)",
    body: LocaleBody,
    response: AccountView,
  }),
  meDeletionInfo: route({
    method: "GET",
    path: "/api/v1/me/deletion",
    auth: "user",
    tag: "me",
    summary:
      "Удаление аккаунта: что удалится, что останется (заказы в работе), чем подтверждать",
    query: LocaleQuery,
    response: DeletionInfo,
  }),
  meDelete: route({
    method: "POST",
    path: "/api/v1/me/delete",
    auth: "user",
    tag: "me",
    summary:
      "Удалить аккаунт навсегда (подтверждение паролем; 400 wrongPassword, 403 staffAccount). Заказ в работе доставим, затем дочистим",
    query: LocaleQuery,
    body: DeleteAccountBody,
    response: AccountDeleted,
  }),
  crmPushConfig: route({
    method: "GET",
    path: "/api/v1/crm/push",
    auth: "staff",
    tag: "me",
    summary: "Push приложения CRM: готов ли APNs, данные Firebase для Android",
    response: CrmPushConfig,
  }),
  crmDevicePut: route({
    method: "PUT",
    path: "/api/v1/crm/devices",
    auth: "staff",
    tag: "me",
    summary:
      "Телефон сотрудника для push приложения CRM (сообщения клиентов, задачи, заявки)",
    body: DeviceBody,
    response: DeviceRegistered,
  }),
  crmDeviceDelete: route({
    method: "POST",
    path: "/api/v1/crm/devices/forget",
    auth: "staff",
    tag: "me",
    summary: "Забыть телефон сотрудника (выход из приложения CRM)",
    body: DeviceForgetBody,
    response: Ok,
  }),
  appConfig: route({
    method: "GET",
    path: "/api/v1/app-config",
    auth: "none",
    tag: "me",
    summary:
      "Настройки приложения: адреса политики конфиденциальности и оферты (locale=ru|kk)",
    query: z.object({ locale: z.enum(["ru", "kk"]).optional() }),
    response: AppConfig,
  }),
} as const satisfies Record<string, RouteDef>;
