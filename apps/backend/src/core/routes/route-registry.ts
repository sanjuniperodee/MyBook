/** Адреса процесса (метод + путь Fastify) — для теневой сверки mybook-api: он повторяет GET только этих адресов. */
export interface RegisteredRoute {
  method: string;
  path: string;
}

/** Служебные адреса, которые mybook-api не сверяет. */
const INTERNAL = new Set(["/api/v1/health", "/api/v1/__nest/routes", "/api/v1/openapi.json"]);

export class RouteRegistry {
  private readonly routes: RegisteredRoute[] = [];
  private readonly seen = new Set<string>();

  add(method: string | string[], path: string) {
    if (INTERNAL.has(path)) return;
    for (const m of Array.isArray(method) ? method : [method]) {
      if (m === "HEAD" || m === "OPTIONS") continue;
      const key = `${m} ${path}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.routes.push({ method: m, path });
    }
  }

  list(): readonly RegisteredRoute[] {
    return this.routes;
  }
}

export const ROUTE_REGISTRY = Symbol("RouteRegistry");
