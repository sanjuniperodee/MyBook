/**
 * Веб-кабинет в API v1 (ADR 0012, A5 — Раздел 1: вход, сессия, полка, приглашения, здоровье):
 * маршруты для Next SSR/RSC и Server Actions без прямого доступа веба к БД.
 */
import { z } from "zod";
import { Ok, iso, route, schemas, uuid, type RouteDef } from "./core";
import { CreatedBook } from "./books";
import { ShelfDeadline } from "./cabinet";

export const WebLocale = z.enum(["ru", "kk", "uz", "en"]);
const Gender = z.enum(["m", "f"]);
const OrderStatusSchema = z.enum(["pending_payment", "paid", "in_production", "shipped", "delivered", "cancelled"]);
const OrderStatusToneSchema = z.enum(["warning", "success", "info", "accent", "neutral", "danger"]);
const AgreementGiftSchema = z.enum(["giftwrap", "delivery"]);

/** Безопасная проекция текущего пользователя для `getCurrentUser()` (без passwordHash/totpSecret/totpBackup). */
export const WebSessionUser = z
  .object({
    id: uuid,
    email: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
    role: z.enum(["user", "admin"]),
    tags: z.array(z.string()),
    lastSeenAt: iso.nullable(),
    remindedAt: iso.nullable(),
    emailOptOut: z.boolean(),
    locale: WebLocale,
    source: z.record(z.string(), z.string()).nullable(),
    crmRoleId: uuid.nullable(),
    managerId: uuid.nullable(),
    sipExtension: z.string().nullable(),
    notifyPrefs: z.record(z.string(), z.unknown()),
    onShift: z.boolean(),
    extraPhones: z.array(z.string()),
    customFields: z.record(z.string(), z.unknown()),
    staffDisabled: z.boolean(),
    totpEnabledAt: iso.nullable(),
    hasTotpSecret: z.boolean(),
    totpBackupCount: z.number().int(),
    deletedAt: iso.nullable(),
    purgedAt: iso.nullable(),
    createdAt: iso,
    updatedAt: iso,
  })
  .register(schemas, { id: "WebSessionUser" });

export const WebSessionResponse = z
  .object({
    user: WebSessionUser.nullable(),
  })
  .register(schemas, { id: "WebSessionResponse" });

export const WebAuthRegisterBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(8).max(200),
    locale: WebLocale.optional(),
    source: z.record(z.string(), z.string()).nullable().optional(),
  })
  .strict()
  .register(schemas, { id: "WebAuthRegisterBody" });

export const WebAuthSession = z
  .object({
    token: z.string(),
    expiresAt: iso,
  })
  .register(schemas, { id: "WebAuthSession" });

export const WebAuthForgotBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    locale: WebLocale.optional(),
  })
  .strict()
  .register(schemas, { id: "WebAuthForgotBody" });

export const WebResetInfo = z
  .object({
    valid: z.boolean(),
    purpose: z.enum(["reset", "access"]).nullable(),
    shopWhatsappDigits: z.string(),
  })
  .register(schemas, { id: "WebResetInfo" });

export const WebResetCompleteBody = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
    password: z.string().min(8).max(200),
  })
  .strict()
  .register(schemas, { id: "WebResetCompleteBody" });

export const WebResetCompleteResult = z
  .object({
    kind: z.enum(["session", "second_factor"]),
    token: z.string().nullable(),
    expiresAt: iso.nullable(),
    secondFactorTicket: z.string().nullable(),
    access: z.boolean(),
  })
  .register(schemas, { id: "WebResetCompleteResult" });

export const WebShelfBookRowBook = z
  .object({
    id: uuid,
    title: z.string(),
    subtitle: z.string(),
    theme: z.string(),
    format: z.string(),
    coverTemplate: z.string(),
    coverLines: z.boolean(),
    coverPhotoId: uuid.nullable(),
    coverPhotoExtra: z.array(z.string()).nullable(),
    coverDesign: z.record(z.string(), z.unknown()).nullable(),
    authorName: z.string(),
    recipientName: z.string(),
    hideRecipientOnCover: z.boolean(),
    namesOnCover: z.string(),
  })
  .register(schemas, { id: "WebShelfBookRowBook" });

export const WebShelfBookRow = z
  .object({
    book: WebShelfBookRowBook,
    answered: z.number().int(),
    total: z.number().int(),
    words: z.number().int(),
    photos: z.number().int(),
  })
  .register(schemas, { id: "WebShelfBookRow" });

export const WebShelfOrder = z
  .object({
    id: uuid,
    number: z.number().int(),
    status: OrderStatusSchema,
    printed: z.boolean(),
    statusLabel: z.string(),
    statusTone: OrderStatusToneSchema,
  })
  .register(schemas, { id: "WebShelfOrder" });

export const WebShelfBook = z
  .object({
    row: WebShelfBookRow,
    kind: z.string(),
    blank: z.boolean(),
    progress: z.number().int(),
    order: WebShelfOrder.nullable(),
    ordered: z.boolean(),
    writeHref: z.string(),
    writeSection: z.string().nullable(),
    deadline: ShelfDeadline.nullable(),
    updated: z.string(),
  })
  .register(schemas, { id: "WebShelfBook" });

export const WebDealAgreementBatch = z
  .object({
    index: z.number().int(),
    size: z.number().int(),
    left: z.number().int(),
    agreedLeft: z.number().int(),
    prepaidLeft: z.number().int(),
    implicit: z.boolean().optional(),
  })
  .register(schemas, { id: "WebDealAgreementBatch" });

export const WebDealAgreement = z
  .object({
    dealId: uuid,
    dealNumber: z.number().int(),
    agreedTotal: z.number().int(),
    prepaid: z.number().int(),
    plan: z.string().nullable(),
    gifts: z.array(AgreementGiftSchema).optional(),
    deadline: z.string().nullable(),
    batch: WebDealAgreementBatch.nullable().optional(),
    recipient: z.string().nullable().optional(),
  })
  .register(schemas, { id: "WebDealAgreement" });

export const WebAgreementBook = z
  .object({
    id: uuid,
    status: z.string(),
    theme: z.string(),
    answered: z.number().int(),
    total: z.number().int(),
    words: z.number().int(),
  })
  .register(schemas, { id: "WebAgreementBook" });

export const WebShelfData = z
  .object({
    books: z.array(WebShelfBook),
    agreement: WebDealAgreement.nullable(),
    agreementBooks: z.array(WebAgreementBook),
  })
  .register(schemas, { id: "WebShelfData" });

export const WebBookCreateBody = z
  .object({
    theme: z.string(),
    language: WebLocale.default("ru"),
    authorName: z.string().max(60),
    authorGender: Gender,
    recipientName: z.string().max(60).optional(),
    recipientGender: Gender.optional(),
    recordedBy: z.string().optional(),
    firstChapterTitle: z.string().optional(),
    dedication: z.string().optional(),
    title: z.string().max(80).optional(),
    occasion: z.string().optional(),
    occasionDate: z.string().optional(),
  })
  .register(schemas, { id: "WebBookCreateBody" });

export const WebInviteReward = z
  .object({
    code: z.string(),
    orderNumber: z.number().int(),
    chat: z.boolean(),
    createdAt: iso,
    used: z.boolean(),
    expiresAt: iso.nullable(),
  })
  .register(schemas, { id: "WebInviteReward" });

export const WebInviteData = z
  .object({
    code: z.string(),
    link: z.string(),
    friendPercent: z.number().int(),
    rewardPercent: z.number().int(),
    friends: z.number().int(),
    rewards: z.array(WebInviteReward),
  })
  .register(schemas, { id: "WebInviteData" });

export const WebHealthOutbox = z
  .object({
    pending: z.number().int(),
    failed: z.number().int(),
    oldestPendingSec: z.number().int().nullable(),
  })
  .register(schemas, { id: "WebHealthOutbox" });

export const WebHealth = z
  .object({
    ok: z.boolean(),
    db: z.boolean(),
    storage: z.boolean(),
    redis: z.boolean().nullable(),
    outbox: WebHealthOutbox.nullable(),
    time: iso,
  })
  .register(schemas, { id: "WebHealth" });

const LocaleQuery = z.object({ locale: WebLocale.optional() });

export const webCabinetRoutes = {
  meWebSession: route({
    method: "GET",
    path: "/api/v1/web/session",
    auth: "none",
    tag: "web-cabinet",
    summary: "Текущая сессия веба: полная безопасная проекция пользователя или null (без 401 на истёкшей cookie)",
    response: WebSessionResponse,
  }),
  webAuthRegister: route({
    method: "POST",
    path: "/api/v1/web/auth/register",
    auth: "none",
    tag: "web-cabinet",
    summary: "Регистрация клиента с сайта: проверка открытой регистрации, лимит и открытие сессии",
    body: WebAuthRegisterBody,
    response: WebAuthSession,
  }),
  webAuthForgot: route({
    method: "POST",
    path: "/api/v1/web/auth/forgot",
    auth: "none",
    tag: "web-cabinet",
    summary: "Запрос письма со ссылкой сброса пароля (с лимитом по IP)",
    body: WebAuthForgotBody,
    response: Ok,
  }),
  webAuthResetInfo: route({
    method: "GET",
    path: "/api/v1/web/auth/reset/{token}",
    auth: "none",
    tag: "web-cabinet",
    summary: "Проверка ссылки сброса пароля или доступа в кабинет (без погашения) + номер WhatsApp поддержки",
    params: z.object({ token: z.string().min(1).max(200) }),
    response: WebResetInfo,
  }),
  webAuthResetComplete: route({
    method: "POST",
    path: "/api/v1/web/auth/reset",
    auth: "none",
    tag: "web-cabinet",
    summary: "Задать новый пароль по ссылке сброса или доступа (с учётом 2FA сотрудника)",
    body: WebResetCompleteBody,
    response: WebResetCompleteResult,
  }),
  webShelf: route({
    method: "GET",
    path: "/api/v1/web/shelf",
    auth: "user",
    tag: "web-cabinet",
    summary: "Полка «Мои книги» для веба: книги с полями обложки, договорённость-бронь и книги для карточки брони",
    query: LocaleQuery,
    response: WebShelfData,
  }),
  webBookCreate: route({
    method: "POST",
    path: "/api/v1/web/books",
    auth: "user",
    tag: "web-cabinet",
    summary: "Создание новой книги с сайта (поддержка всех языков веба: ru, kk, uz, en)",
    body: WebBookCreateBody,
    response: CreatedBook,
  }),
  webBookDelete: route({
    method: "DELETE",
    path: "/api/v1/web/books/{bookId}",
    auth: "user",
    tag: "web-cabinet",
    summary: "Удаление книги клиента (черновик без заказов)",
    params: z.object({ bookId: uuid }),
    response: Ok,
  }),
  webInvite: route({
    method: "GET",
    path: "/api/v1/web/invite",
    auth: "user",
    tag: "web-cabinet",
    summary: "Страница приглашений: персональный код, ссылка, проценты и список наград",
    query: LocaleQuery,
    response: WebInviteData,
  }),
  webHealth: route({
    method: "GET",
    path: "/api/v1/web/health",
    auth: "none",
    tag: "web-cabinet",
    summary: "Состояние инфраструктуры для /api/health веба (БД, хранилище, Redis, outbox)",
    response: WebHealth,
  }),
} as const satisfies Record<string, RouteDef>;
