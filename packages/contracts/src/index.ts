/**
 * Контракты API (ADR 0012): схемы v1, OpenAPI и TS-клиент. Сервер — apps/api, Dart-клиент — mobile/lib/api.
 */
export const contractsVersion = 1;
export * from "./v1/routes";
export { openapi } from "./v1/openapi";
export { createApiClient, ApiClientError, buildUrl, type ApiClient, type ApiClientOptions } from "./client";
