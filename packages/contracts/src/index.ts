/**
 * Контракты API (ADR 0012): схемы v1, OpenAPI и TS-клиент. Сервер — apps/backend (Nest, ADR 0014), Dart-клиент — lib/api в репозитории mybook-mobile (ADR 0013).
 */
export const contractsVersion = 1;
export * from "./v1/routes";
export { createRouter, type Matched } from "./router";
export { openapi } from "./v1/openapi";
export { createApiClient, ApiClientError, buildUrl, type ApiClient, type ApiClientOptions } from "./client";
