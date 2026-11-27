import { markApiProcess } from "@/server/v1-web-client";

/**
 * Процесс — сам API с базой (ADR 0014: с 27.11 бэкенд на Nest заменил mybook-api): чтения старого кода
 * (v1WebRead при WEB_USE_API_V1 в .env сервера) идут прямо в базу, а не HTTP-запросом в API — его больше нет.
 * Зовут оба процесса Nest: бэкенд (main.ts) и воркер (worker.ts).
 */
export function becomeApiProcess(): void {
  markApiProcess();
}
