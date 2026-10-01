import "server-only";
import { after } from "next/server";
import type { Logger } from "../application/Logger";

/**
 * Выполнить после ответа клиенту (Next.js after), а вне HTTP-запроса (скрипты, планировщик) — сразу.
 * Для подписчиков, которые не должны задерживать пользователя: CRM, подготовка файлов.
 */
export function runInBackground(task: () => Promise<unknown>, logger?: Logger) {
  const job = () => task().catch((err) => (logger ? logger.error("background job failed", err) : console.error("[background]", err)));
  try {
    after(job);
  } catch {
    void job();
  }
}
