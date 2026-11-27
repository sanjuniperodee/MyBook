import { markApiProcess } from "@/server/v1-web-client";

/**
 * Процесс — сам API с базой (ADR 0014: с 27.11 бэкенд на Nest заменил mybook-api): чтения старого кода
 * (v1WebRead при WEB_USE_API_V1 в .env сервера) идут прямо в базу, а не HTTP-запросом в API — его больше нет.
 * Зовут оба процесса Nest: бэкенд (main.ts) и воркер (worker.ts).
 */
export function becomeApiProcess(): void {
  markApiProcess();
}

/**
 * Каталог из настроек CRM («Цены и тарифы», флаги сайта, реквизиты) в процессе API: сразу до приёма запросов и затем
 * раз в 10 с, как в воркере (src/worker/run.ts). Без этого API считает по заводским ценам src/config/site.ts.
 */
export async function startApiCatalogSync(): Promise<void> {
  const { ensureCatalog, startCatalogSync } = await import("@/server/catalog");
  await ensureCatalog();
  startCatalogSync();
}
