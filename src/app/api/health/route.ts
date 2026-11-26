import { v1WebRead } from "@/web/api";

export const dynamic = "force-dynamic";

/** Проверка живости для мониторинга (blackbox, uptime-сервисы): база и хранилище файлов. */
export async function GET() {
  try {
    const status = await v1WebRead({
      name: "cabinet.health",
      section: "cabinet",
      viaApi: async (api) => {
        const h = await api.webHealth({});
        return { ok: h.ok, db: h.db, storage: h.storage, redis: h.redis, outbox: h.outbox };
      },
    });
    return Response.json({ ...status, time: new Date().toISOString() }, { status: status.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { ok: false, db: false, storage: false, redis: null, outbox: null, time: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
