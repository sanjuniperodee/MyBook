import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { putFile, deleteFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Проверка живости для мониторинга (blackbox, uptime-сервисы): база и хранилище файлов. */
export async function GET() {
  const checks = { db: false, storage: false };
  try {
    await db.execute(sql`select 1`);
    checks.db = true;
  } catch {}
  try {
    await putFile("cache/health-check", "ok");
    await deleteFile("cache/health-check");
    checks.storage = true;
  } catch {}
  const ok = checks.db && checks.storage;
  return Response.json({ ok, ...checks, time: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
