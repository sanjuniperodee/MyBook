import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/** Проверка живости для мониторинга (blackbox, uptime-сервисы): база и хранилище файлов. */
export async function GET() {
  const checks = { db: false, storage: false };
  checks.db = await container().databaseHealthy();
  checks.storage = await container().storageHealthy();
  // Outbox: зависшие или «мёртвые» события — сигнал, что подписчик (почта, CRM) не справляется.
  // Redis опционален: null — не настроен; false — настроен, но недоступен (лимиты работают из памяти).
  const { redis, outbox } = checks.db ? await container().infraHealth() : { redis: null, outbox: null };
  const ok = checks.db && checks.storage && redis !== false;
  return Response.json({ ok, ...checks, redis, outbox, time: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
