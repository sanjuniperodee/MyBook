/**
 * API v1 (ADR 0012): единственный путь к данным для веба и мобильного приложения. Здесь только сборка маршрутов
 * доменов; схемы и маршруты — в файлах доменов (auth.ts, books.ts, …), общее — core.ts. Из v1 — OpenAPI
 * (scripts/contracts/generate.ts), TS-клиент (../client.ts) и Dart-клиент (mybook-mobile: lib/api/mybook_api.g.dart).
 * Сервер — бэкенд на Nest (apps/backend, ADR 0014).
 *
 * Новый домен: v1/<домен>.ts с объектом <домен>Routes → строка здесь → контроллер с @Endpoint в apps/backend/src/modules
 * → npx tsx scripts/contracts/generate.ts (после rebase — тоже: генерация
 * собирает все домены, конфликт в сгенерированных файлах решается перегенерацией).
 */
import type { z } from "zod";
import { authRoutes } from "./auth";
import { boardsRoutes } from "./boards";
import { booksRoutes } from "./books";
import { lettersRoutes } from "./letters";
import { previewRoutes } from "./preview";
import { reviewsRoutes } from "./reviews";
import { coverRoutes } from "./cover";
import { pagesRoutes } from "./pages";
import { photoEditorRoutes } from "./photo-editor";
import { crmListsRoutes } from "./crm-lists";
import { meRoutes } from "./me";
import { bookModelRoutes } from "./book-model";
import { wizardRoutes } from "./wizard";
import { cabinetRoutes } from "./cabinet";
import { cabinetOrderRoutes } from "./cabinet-orders";
import { crmRoutes } from "./crm";
import { crmFinanceRoutes } from "./crm-finance";
import { crmAnalyticsRoutes } from "./crm-analytics";
import { crmSettingsRoutes } from "./crm-settings";
import { crmMarketingRoutes } from "./crm-marketing";
import { crmProductionRoutes } from "./crm-production";
import { crmCatalogRoutes } from "./crm-catalog";
import { crmAdminRoutes } from "./crm-admin";
import { crmKpRoutes } from "./crm-kp";
import { crmSecurityRoutes } from "./crm-security";
import { opsHealthRoutes } from "./ops-health";
import { crmInvoiceRoutes } from "./crm-invoices";
import { crmMobileRestRoutes } from "./crm-mobile-rest";
import { answerFilesRoutes } from "./answer-files";
import { webCabinetRoutes } from "./web-cabinet";
import { webBookPagesRoutes } from "./web-book-pages";
import { webOrdersRoutes } from "./web-orders";
import { webPublicRoutes } from "./web-public";
import { webCrmRoutes } from "./web-crm";
import type { RouteDef } from "./core";

export * from "./core";
export * from "./auth";
export * from "./boards";
export * from "./books";
export * from "./letters";
export * from "./preview";
export * from "./reviews";
export * from "./cover";
export * from "./pages";
export * from "./photo-editor";
export * from "./crm-lists";
export * from "./me";
export * from "./book-model";
export * from "./wizard";
export * from "./cabinet";
export * from "./cabinet-orders";
export * from "./crm";
export * from "./crm-finance";
export * from "./crm-analytics";
export * from "./crm-settings";
export * from "./crm-marketing";
export * from "./crm-production";
export * from "./crm-catalog";
export * from "./crm-admin";
export * from "./crm-kp";
export * from "./crm-security";
export * from "./ops-health";
export * from "./crm-invoices";
export * from "./crm-mobile-rest";
export * from "./answer-files";
export * from "./web-cabinet";
export * from "./web-book-pages";
export * from "./web-orders";
export * from "./web-public";
export * from "./web-crm";

export const v1 = {
  ...authRoutes,
  ...booksRoutes,
  ...lettersRoutes,
  ...previewRoutes,
  ...reviewsRoutes,
  ...coverRoutes,
  ...pagesRoutes,
  ...photoEditorRoutes,
  ...crmListsRoutes,
  ...meRoutes,
  ...bookModelRoutes,
  ...wizardRoutes,
  ...cabinetRoutes,
  ...cabinetOrderRoutes,
  // CRM для сотрудников (приложение CRM).
  ...crmRoutes,
  ...crmFinanceRoutes,
  ...crmAnalyticsRoutes,
  ...crmSettingsRoutes,
  ...crmMarketingRoutes,
  ...crmProductionRoutes,
  ...crmCatalogRoutes,
  ...crmAdminRoutes,
  ...crmKpRoutes,
  ...crmSecurityRoutes,
  // Фон и очереди (наблюдаемость фона, право settings.manage).
  ...opsHealthRoutes,
  ...crmInvoiceRoutes,
  ...crmMobileRestRoutes,
  // Доски задач и календарь (приложение CRM).
  ...boardsRoutes,
  // Свои видео, аудио и ссылки по QR в ответах клиента.
  ...answerFilesRoutes,
  // Веб-кабинет (SSR и Server Actions без прямого доступа к БД).
  ...webCabinetRoutes,
  // Страницы и оболочка редактора книги (Раздел 2A, section: "book").
  ...webBookPagesRoutes,
  // Оформление заказа, заказы и оплата для веба (Раздел 3, section: "orders").
  ...webOrdersRoutes,
  // Публичные страницы сайта: каталог, подвал, отзывы, сертификат, письма и отзывы по ссылке, отписка (Раздел 4, section: "public").
  ...webPublicRoutes,
  // CRM сайта /admin: права сотрудника и операции областей (Раздел 5, section: "crm").
  ...webCrmRoutes,
} as const satisfies Record<string, RouteDef>;

export type V1 = typeof v1;
export type RouteName = keyof V1;
export type Input<N extends RouteName> = (V1[N] extends { params: infer P extends z.ZodType } ? z.input<P> : unknown) &
  (V1[N] extends { query: infer Q extends z.ZodType } ? z.input<Q> : unknown) &
  (V1[N] extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown) &
  (V1[N] extends { files: object } ? { files: Blob[] } : unknown);
/** То же после разбора схемами на сервере (значения по умолчанию подставлены) — вход контроллеров бэкенда (@Input). */
export type Parsed<N extends RouteName> = (V1[N] extends { params: infer P extends z.ZodType } ? z.output<P> : unknown) &
  (V1[N] extends { query: infer Q extends z.ZodType } ? z.output<Q> : unknown) &
  (V1[N] extends { body: infer B extends z.ZodType } ? { body: z.output<B> } : unknown) &
  (V1[N] extends { files: object } ? { files: File[] } : unknown);
export type Output<N extends RouteName> = z.output<V1[N]["response"]>;
