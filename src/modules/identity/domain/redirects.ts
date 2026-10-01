/** Куда вернуть после входа: только относительный путь своего сайта (защита от open redirect). */
export function safeNextPath(next: unknown, fallback = "/books") {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
