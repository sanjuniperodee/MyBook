import "server-only";
import { countPerf } from "@/shared/infrastructure/perfLog";

/**
 * Обёртка маршрута, который отдаёт файл: считает запросы, байты (по Content-Length, если он известен заранее) и время
 * до ответа — в журнал замеров раз в 5 минут (G1, perfLog.ts). Ответ и ошибки не меняет.
 */
export function fileRoute<A extends unknown[]>(name: string, handler: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const t0 = performance.now();
    const res = await handler(...args);
    countPerf(`route:${name}`, Number(res.headers.get("content-length") ?? 0), performance.now() - t0, res.status);
    return res;
  };
}
