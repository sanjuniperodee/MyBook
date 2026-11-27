import type { RouteDef } from "./v1/core";

/** Маршрут контракта, найденный по методу и пути, и параметры пути. */
export interface Matched<N extends string> {
  name: N;
  route: RouteDef;
  params: Record<string, string>;
}

/**
 * Таблица маршрутов из контракта — одна для обоих HTTP-процессов: mybook-api ищет по ней обработчик, бэкенд на Nest —
 * ответ 405 с Allow, когда путь есть, а метода нет (ADR 0014).
 * Путь /api/v1/books/{bookId} → регулярное выражение с именованными группами.
 */
/** Статические сегменты приоритетнее параметров `{id}` (как в Fastify/radix-дереве), чтобы `/clients/new` не затенялся `/clients/{clientId}`. */
function compareRoutePaths(a: string, b: string): number {
  const sa = a.split("/");
  const sb = b.split("/");
  const len = Math.min(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const pa = /^\{\w+\}$/.test(sa[i]);
    const pb = /^\{\w+\}$/.test(sb[i]);
    if (pa !== pb) return pa ? 1 : -1;
  }
  return sa.length - sb.length;
}

export function createRouter<N extends string>(routes: Record<N, RouteDef>) {
  const table = (Object.entries(routes) as [N, RouteDef][])
    .map(([name, route], order) => ({
      name,
      route,
      order,
      re: new RegExp(`^${route.path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{(\w+)\\?\}/g, "(?<$1>[^/]+)")}$`),
    }))
    .sort((a, b) => compareRoutePaths(a.route.path, b.route.path) || a.order - b.order);
  return {
    /** null — пути нет; { allowed } — путь есть, метода нет (405). */
    match(method: string, pathname: string): Matched<N> | { allowed: string[] } | null {
      const allowed: { method: string; order: number }[] = [];
      for (const { name, route, order, re } of table) {
        const m = re.exec(pathname);
        if (!m) continue;
        if (route.method === method) {
          const params: Record<string, string> = {};
          for (const [k, v] of Object.entries(m.groups ?? {})) params[k] = decodeURIComponent(v);
          return { name, route, params };
        }
        if (!allowed.some((x) => x.method === route.method)) allowed.push({ method: route.method, order });
      }
      if (!allowed.length) return null;
      allowed.sort((a, b) => a.order - b.order);
      return { allowed: allowed.map((x) => x.method) };
    },
  };
}
