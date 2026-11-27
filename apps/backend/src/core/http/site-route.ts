import { applyDecorators, createParamDecorator, Delete, Get, HttpCode, Patch, Post, Put, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

export type SiteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type SiteAuth = "none" | "user" | "staff";

export interface SiteRouteOptions {
  auth: SiteAuth;
  /** Проверка Origin/Host (по умолчанию true для POST/PUT/PATCH/DELETE с user/staff, false для GET и auth:"none"). */
  csrf?: boolean;
  /** Разрешить доступ к маршруту сотрудника до настройки 2FA (настройка/подключение TOTP). */
  allowUnconfigured2fa?: boolean;
  /** Вычислять ETag и отдавать 304 на GET для JSON-ответов (когда контроллер не вернул готовый Response). */
  etag?: boolean;
}

export interface SiteRouteMeta {
  method: SiteMethod;
  /** Канонический путь вида `/api/...` (без `/api/v1/site`). */
  path: string;
  options: SiteRouteOptions;
}

export const SITE_ROUTE = Symbol("siteRoute");
export const SITE_ROUTE_REGISTRY = Symbol("siteRouteRegistry");

const METHOD = { GET: Get, POST: Post, PUT: Put, PATCH: Patch, DELETE: Delete } as const;

/** `/api/v1/site/foo` → `/api/foo`, чтобы маршрут работал на обоих префиксах одинаково. */
export function normalizeSitePath(pathname: string): string {
  if (pathname === "/api/v1/site") return "/api";
  if (pathname.startsWith("/api/v1/site/")) return `/api/${pathname.slice("/api/v1/site/".length)}`;
  return pathname;
}

/**
 * Шаблон маршрута сайта (`{id}` и `/{path*}`) → список путей Nest/Fastify
 * для обоих префиксов (`/api/...` и `/api/v1/site/...`). Для `/{path*}`
 * регистрируем и точный префикс, и `/*`, т.к. в Fastify `/*` требует `/`.
 */
export function expandSiteNestPaths(canonicalPath: string): string[] {
  const expandPrefix = (base: string): string[] => {
    const nest = base.replace(/\/\{(\w+)\*\}/g, "/*").replace(/\{(\w+)\}/g, ":$1");
    if (!nest.endsWith("/*")) return [nest];
    const parent = nest.slice(0, -2);
    return parent ? [parent, nest] : [nest];
  };
  const siteAlias = `/api/v1/site${canonicalPath.slice("/api".length)}`;
  return [...new Set([...expandPrefix(canonicalPath), ...expandPrefix(siteAlias)])];
}

/**
 * Маршрут сайта вне контракта (вебхуки, потоки, файлы, старые JSON `/api/...`, дублируемые на `/api/v1/site/...`).
 * Поддерживает параметры `{id}` и хвост `/{path*}`, `@RawBody()`, и возврат Web `Response`.
 */
export function SiteRoute(method: SiteMethod, path: string, options: SiteRouteOptions): MethodDecorator {
  const canonical = normalizeSitePath(path);
  if (!canonical.startsWith("/api/") || canonical.startsWith("/api/v1/")) {
    throw new Error(`@SiteRoute путь должен начинаться с /api/ или /api/v1/site/, а не с /api/v1/: ${path}`);
  }
  const paths = expandSiteNestPaths(canonical);
  return applyDecorators(METHOD[method](paths), HttpCode(200), SetMetadata(SITE_ROUTE, { method, path: canonical, options } satisfies SiteRouteMeta));
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- обработчик маршрута Nest
export const siteRouteOf = (reflector: Reflector, handler: Function) => reflector.get<SiteRouteMeta | undefined>(SITE_ROUTE, handler);

/** Сырое тело запроса (UTF-8 байты JSON/формы/текста) для проверки HMAC-подписей вебхуков. */
export const RawBody = createParamDecorator((_: unknown, ctx: ExecutionContext): Buffer => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest>();
  if (req.rawBody) return req.rawBody;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  if (Buffer.isBuffer(req.body)) return req.body;
  return Buffer.alloc(0);
});

function compileSitePattern(pattern: string): RegExp {
  const escaped = pattern
    .replace(/\/\{(\w+)\*\}/g, "__WILDCARD_$1__")
    .replace(/\{(\w+)\}/g, "__PARAM_$1__")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/__WILDCARD_(\w+)__/g, "(?:/(?<$1>.*))?")
    .replace(/__PARAM_(\w+)__/g, "(?<$1>[^/]+)");
  return new RegExp(`^${escaped}$`);
}

/**
 * Насколько шаблон точен для сопоставления, как у Next.js и реестра сайта mybook-api: по сегментам слева направо
 * статический сегмент важнее `{param}`, а тот — важнее хвоста `{path*}`. Больше — точнее.
 */
function specificity(pattern: string): number[] {
  return pattern
    .split("/")
    .filter(Boolean)
    .map((seg) => (/^\{\w+\*\}$/.test(seg) ? 0 : /^\{\w+\}$/.test(seg) ? 1 : 2));
}

function moreSpecific(a: string, b: string): boolean {
  const x = specificity(a);
  const y = specificity(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Реестр маршрутов сайта текущего процесса Nest — для точного 405 Method Not Allowed с заголовком Allow. */
export class SiteRouteRegistry {
  private readonly entries: Array<{ method: SiteMethod; path: string; regex: RegExp }> = [];

  add(method: SiteMethod, canonicalPath: string) {
    this.entries.push({ method, path: canonicalPath, regex: compileSitePattern(canonicalPath) });
  }

  /**
   * Самый точный шаблон сайта для адреса и его методы. Как в mybook-api и Next.js, выбор шаблона окончателен:
   * `POST /api/admin/calls/whatsapp/live` — это маршрут `…/live` (только GET), а не `…/{id}`, — 405, а не обработчик звонка.
   */
  best(pathname: string): { path: string; methods: SiteMethod[] } | null {
    const normalized = normalizeSitePath(pathname);
    let path: string | null = null;
    for (const e of this.entries) {
      if (e.regex.test(normalized) && (path === null || moreSpecific(e.path, path))) path = e.path;
    }
    if (path === null) return null;
    return { path, methods: [...new Set(this.entries.filter((e) => e.path === path).map((e) => e.method))] };
  }

  /** Возвращает разрешённые методы, если путь совпадает с маршрутом сайта, но не для запрошенного method. */
  allowed(method: string, pathname: string): SiteMethod[] {
    const found = this.best(pathname);
    if (!found) return [];
    const upper = method.toUpperCase();
    if (found.methods.some((m) => m === upper || (upper === "HEAD" && m === "GET"))) return [];
    return found.methods;
  }
}
