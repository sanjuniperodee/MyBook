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
export function createRouter<N extends string>(routes: Record<N, RouteDef>) {
  const table = (Object.entries(routes) as [N, RouteDef][]).map(([name, route]) => ({
    name,
    route,
    re: new RegExp(`^${route.path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{(\w+)\\?\}/g, "(?<$1>[^/]+)")}$`),
  }));
  return {
    /** null — пути нет; { allowed } — путь есть, метода нет (405). */
    match(method: string, pathname: string): Matched<N> | { allowed: string[] } | null {
      const allowed: string[] = [];
      for (const { name, route, re } of table) {
        const m = re.exec(pathname);
        if (!m) continue;
        if (route.method === method) {
          const params: Record<string, string> = {};
          for (const [k, v] of Object.entries(m.groups ?? {})) params[k] = decodeURIComponent(v);
          return { name, route, params };
        }
        allowed.push(route.method);
      }
      return allowed.length ? { allowed } : null;
    },
  };
}
