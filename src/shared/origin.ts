/**
 * Защита от CSRF поверх SameSite=Lax: изменяющий запрос с чужим Origin отклоняется. Разрешены адрес сайта (APP_URL) и
 * хост самого запроса; без Origin (приложение, curl, серверные вызовы) — можно. Одно правило для mybook-api и бэкенда
 * на Nest (ADR 0014).
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function originAllowed(req: { method: string; origin: string | null; host: string | null }, appUrl: string): boolean {
  if (SAFE_METHODS.has(req.method) || !req.origin) return true;
  const allowed = new Set([new URL(appUrl).host]);
  if (req.host) allowed.add(req.host);
  return allowed.has(originHost(req.origin));
}

/** Хост из заголовка Origin; у «null» (песочные iframe, часть приватных режимов) и мусора — пустая строка, её нет среди разрешённых. */
function originHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}
