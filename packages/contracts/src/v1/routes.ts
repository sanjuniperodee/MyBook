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
import { cabinetRoutes } from "./cabinet";
import { crmRoutes } from "./crm";
import type { RouteDef } from "./core";

export * from "./core";
export * from "./auth";
export * from "./boards";
export * from "./books";
export * from "./letters";
export * from "./cabinet";
export * from "./crm";

export const v1 = {
  ...authRoutes,
  ...booksRoutes,
  ...lettersRoutes,
  ...cabinetRoutes,
  // CRM для сотрудников (приложение CRM).
  ...crmRoutes,
  // Доски задач и календарь (приложение CRM).
  ...boardsRoutes,
} as const satisfies Record<string, RouteDef>;

export type V1 = typeof v1;
export type RouteName = keyof V1;
export type Input<N extends RouteName> = (V1[N] extends { params: infer P extends z.ZodType } ? z.input<P> : unknown) &
  (V1[N] extends { query: infer Q extends z.ZodType } ? z.input<Q> : unknown) &
  (V1[N] extends { body: infer B extends z.ZodType } ? { body: z.input<B> } : unknown) &
  (V1[N] extends { files: object } ? { files: Blob[] } : unknown);
export type Output<N extends RouteName> = z.output<V1[N]["response"]>;
