/**
 * API v1 (ADR 0012): единственный путь к данным для веба и мобильного приложения. Здесь только сборка маршрутов
 * доменов; схемы и маршруты — в файлах доменов (auth.ts, books.ts, …), общее — core.ts. Из v1 — OpenAPI
 * (/api/v1/openapi.json), TS-клиент (../client.ts) и Dart-клиент (mobile/lib/api/mybook_api.g.dart,
 * scripts/contracts/generate.ts). Сервер — apps/api.
 *
 * Новый домен: v1/<домен>.ts с объектом <домен>Routes → строка здесь → обработчики в apps/api/src/routes/<домен>.ts →
 * строка в apps/api/src/routes/index.ts → npx tsx scripts/contracts/generate.ts (после rebase — тоже: генерация
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
import { answerFilesRoutes } from "./answer-files";
import type { RouteDef } from "./core";

export * from "./core";
export * from "./auth";
export * from "./boards";
export * from "./books";
export * from "./letters";
export * from "./preview";
export * from "./reviews";
export * from "./cover";
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
export * from "./answer-files";

export const v1 = {
  ...authRoutes,
  ...booksRoutes,
  ...lettersRoutes,
  ...previewRoutes,
  ...reviewsRoutes,
  ...coverRoutes,
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
  // Доски задач и календарь (приложение CRM).
  ...boardsRoutes,
  // Свои видео, аудио и ссылки по QR в ответах клиента.
  ...answerFilesRoutes,
} as const satisfies Record<string, RouteDef>;

export type V1 = typeof v1;
export type RouteName = keyof V1;
export type Input<N extends RouteName> = (V1[N] extends { params: infer P extends z.ZodType } ? z.input<P> : unknown) &
  (V1[N] extends { query: infer Q extends z.ZodType } ? z.input<Q> : unknown) &
  (V1[N] extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown) &
  (V1[N] extends { files: object } ? { files: Blob[] } : unknown);
/** То же после разбора схемами на сервере (значения по умолчанию подставлены) — вход обработчиков apps/api. */
export type Parsed<N extends RouteName> = (V1[N] extends { params: infer P extends z.ZodType } ? z.output<P> : unknown) &
  (V1[N] extends { query: infer Q extends z.ZodType } ? z.output<Q> : unknown) &
  (V1[N] extends { body: infer B extends z.ZodType } ? { body: z.output<B> } : unknown) &
  (V1[N] extends { files: object } ? { files: File[] } : unknown);
export type Output<N extends RouteName> = z.output<V1[N]["response"]>;
