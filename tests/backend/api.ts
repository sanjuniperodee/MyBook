import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, vi } from "vitest";
import { AppModule } from "../../apps/backend/src/app.module";
import { configureApp, createAdapter } from "../../apps/backend/src/bootstrap";
import { SESSION_USERS, type SessionUsers } from "../../apps/backend/src/core/auth/session";
import { STAFF_ACCESS, type StaffAccessPort } from "../../apps/backend/src/core/auth/staff";
import { ROUTE_REGISTRY, type RouteRegistry } from "../../apps/backend/src/core/routes/route-registry";
import { CLOCK, RATE_LIMITER, UNIT_OF_WORK } from "../../apps/backend/src/core/kernel/tokens";
import { LEGACY_CONTAINER } from "../../apps/backend/src/legacy/legacy.tokens";
import { AUTHORING } from "../../apps/backend/src/modules/authoring/authoring.tokens";
import { FEEDBACK_PORTS } from "../../apps/backend/src/modules/feedback/feedback.tokens";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail, type CurrentUser } from "@/modules/identity";
import { allPermissions, type Permission, type RoleScope } from "@/shared/domain/permissions";
import { HttpError } from "@/server/api";
import { container } from "@/server/container";

/**
 * Бэкенд целиком, как на проде (ADR 0014): ядро Nest, guard-ы, фильтр ошибок, контроллеры и настоящие адаптеры
 * apps/backend/src/legacy/*.ports.ts, которые зовут общий код src/server/* и container() — его тест подменяет своими
 * двойниками (vi.mock), как раньше для прежнего mybook-api. Запросы — Fastify inject, без порта.
 *
 * Кто вошёл и права сотрудника — по умолчанию из двойника container(): сессия — identity.queries.userBySession (как
 * localCurrentUserByToken), роль и правило IP/2FA — access.resolver (StaffResolver). Тест может подменить вход
 * функциями `auth` (как прежний Authenticator) — тогда к запросу без сессии добавляется служебная cookie.
 */
export interface NestApiAuth {
  /** Вошедший пользователь; HttpError(401) или null — не вошёл. */
  user(req: Request): Promise<unknown>;
  /** Сотрудник CRM: роль и права (StaffAccessPort); null — не сотрудник (403). */
  staff?: StaffAccessPort["resolve"];
}

export interface NestApiOptions {
  auth?: NestApiAuth;
  overrides?: [token: unknown, value: unknown][];
}

export type ApiFetch = ((req: Request) => Promise<Response>) & { app: NestFastifyApplication };

/**
 * Вход как у прежнего Authenticator тестов (user/staff по запросу): staff не бросил — сотрудник с правами `permissions`
 * (по умолчанию — все, как руководитель) и областью `scope`; бросил — не сотрудник (403).
 */
export type LegacyRole = { permissions?: readonly Permission[]; scope?: RoleScope; isOwner?: boolean };

export function legacyAuth(
  auth: { user(req: Request): Promise<unknown>; staff(req: Request): Promise<unknown> },
  /** Роль сотрудника; функция — роль на момент запроса (тест меняет права между вызовами), можно готовый StaffContext. */
  role?: LegacyRole | ((user: CurrentUser) => LegacyRole | StaffContext),
): NestApiAuth {
  let last: Request | null = null;
  return {
    user: (req) => ((last = req), auth.user(req)),
    async staff(user, ip) {
      try {
        await auth.staff(last!);
      } catch {
        return null;
      }
      // Роль не задана: у сотрудника с ролью в двойнике container() (access.resolver) — она, иначе руководитель.
      if (role === undefined) {
        const byContainer = await (await containerAuth()).staff.resolve(user, ip).catch(() => null);
        if (byContainer) return byContainer;
      }
      const r = (typeof role === "function" ? role(user) : role) ?? {};
      if (r instanceof StaffContext || "can" in r) return { context: r as StaffContext, gate: null };
      const isOwner = r.isOwner ?? !r.permissions;
      const context = new StaffContext(user.id, isOwner ? "Руководитель" : "Сотрудник", isOwner ? "owner" : null, r.scope ?? "all", new Set(r.permissions ?? allPermissions), isOwner, { isPhoneEmail });
      return { context, gate: null };
    },
  };
}

const SYNTHETIC_SESSION = "test-session-from-auth-double-xx";

/** Контейнер теста в момент обращения: двойники меняются между тестами (resetContainer, fake.x = …). */
const live = () => container() as unknown as Record<string, unknown>;
const bound = (src: object, key: PropertyKey) => {
  const v = Reflect.get(src, key) as unknown;
  return typeof v === "function" ? v.bind(src) : v;
};
const liveContainer = new Proxy({}, { get: (_t, key) => bound(live(), key) });
const liveOr = <T extends object>(key: string, fallback: T): T => new Proxy(fallback, { get: (_t, k) => bound((live()[key] as T | undefined) ?? fallback, k) }) as T;

/** Порт сессий и прав по двойнику container() — те же источники, что у прежнего mybook-api (localCurrentUserByToken). */
async function containerAuth(): Promise<{ sessions: SessionUsers; staff: StaffAccessPort }> {
  const { localCurrentUserByToken } = await import("@/server/v1-local-bridge");
  return {
    sessions: { user: (token) => localCurrentUserByToken(token) },
    staff: {
      async resolve(user, ip) {
        const c = live() as { access?: { resolver?: { resolve(a: unknown): Promise<unknown>; gate(a: unknown, ip: string): Promise<unknown> } } };
        const resolver = c.access?.resolver;
        if (!resolver) return null;
        const account = { id: user.id, role: user.role, staffDisabled: user.staffDisabled, crmRoleId: user.crmRoleId, twoFactorEnabled: !!user.totpEnabledAt && !!user.totpSecret };
        const context = await resolver.resolve(account);
        if (!context) return null;
        return { context, gate: await resolver.gate(account, ip) } as never;
      },
    },
  };
}

const opened: NestFastifyApplication[] = [];
afterAll(async () => {
  while (opened.length) await opened.pop()!.close();
});

/** Поднять бэкенд для теста: вернёт fetch-подобную функцию (Request → Response); закрывается после файла тестов. */
export async function nestApi(opts: NestApiOptions = {}): Promise<ApiFetch> {
  const byContainer = await containerAuth();
  let current: Request | null = null;
  const sessions: SessionUsers = opts.auth
    ? {
        async user() {
          try {
            return ((await opts.auth!.user(current!)) ?? null) as CurrentUser | null;
          } catch (err) {
            if (err instanceof HttpError) return null;
            throw err;
          }
        },
      }
    : byContainer.sessions;
  const staff: StaffAccessPort = opts.auth?.staff ? { resolve: opts.auth.staff } : opts.auth ? { resolve: async () => null } : byContainer.staff;

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LEGACY_CONTAINER).useValue(liveContainer)
    // Адаптеры, которые берут объект контейнера целиком при сборке, — тоже на момент обращения.
    .overrideProvider(AUTHORING).useValue(liveOr("authoring", {}))
    .overrideProvider(FEEDBACK_PORTS).useValue(liveOr("feedbackPorts", {}))
    .overrideProvider(UNIT_OF_WORK).useValue(liveOr("uow", { run: (fn: () => unknown) => fn() }))
    .overrideProvider(CLOCK).useValue(liveOr("clock", { now: () => new Date() }))
    .overrideProvider(RATE_LIMITER).useValue(liveOr("rateLimiter", { hit: async () => true, peek: async () => null, reset: async () => {} }))
    .overrideProvider(SESSION_USERS).useValue(sessions)
    .overrideProvider(STAFF_ACCESS).useValue(staff);
  for (const [token, value] of opts.overrides ?? []) builder = builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();
  const app = await configureApp(moduleRef.createNestApplication<NestFastifyApplication>(createAdapter(), { logger: process.env.DEBUG_API ? ["error", "warn"] : false }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  opened.push(app);

  const call = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const headers: Record<string, string> = { host: url.host };
    req.headers.forEach((v, k) => (headers[k] = v));
    if (opts.auth && !/(^|;\s*)mb_session=/.test(headers.cookie ?? "") && !headers.authorization) {
      headers.cookie = [headers.cookie, `mb_session=${SYNTHETIC_SESSION}`].filter(Boolean).join("; ");
    }
    const payload = req.method === "GET" || req.method === "HEAD" || !req.body ? undefined : Buffer.from(await req.arrayBuffer());
    current = req;
    const res = await app.inject({ method: req.method as "GET", url: url.pathname + url.search, headers, payload });
    const out = new Headers();
    for (const [k, v] of Object.entries(res.headers)) {
      if (v === undefined) continue;
      for (const one of Array.isArray(v) ? v : [String(v)]) out.append(k, one);
    }
    const body = res.statusCode === 204 || res.statusCode === 304 ? null : new Uint8Array(res.rawPayload);
    if (process.env.DEBUG_API) console.error("API", req.method, url.pathname, res.statusCode, res.body.slice(0, 300), JSON.stringify(headers));
    return new Response(body, { status: res.statusCode, headers: out });
  };
  return Object.assign(call, { app });
}

/**
 * ADR 0013: у веба нет локальных веток — страницы и действия ходят в API v1. В тестах запросы веба к API
 * (`API_INTERNAL_URL`, 127.0.0.1:3044) уходят в бэкенд на Nest в том же процессе — с теми же двойниками container().
 */
export async function routeWebToApi(opts: NestApiOptions = {}): Promise<ApiFetch> {
  const api = await nestApi(opts);
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    return url.startsWith("http://127.0.0.1:3044/") ? api(new Request(url, init)) : real(input, init);
  });
  return api;
}

/** Адреса, которые бэкенд зарегистрировал (метод не важен), в записи Fastify: /api/books/:id, хвост {path*} — *. */
export function registeredPaths(api: ApiFetch): Set<string> {
  return new Set(api.app.get<RouteRegistry>(ROUTE_REGISTRY).list().map((r) => r.path));
}

/** Маршрут сайта (запись контракта /api/books/{id}) есть в бэкенде по обоим префиксам: /api/… и /api/v1/site/…. */
export function siteRouteMissing(api: ApiFetch, paths: readonly string[]): string[] {
  const have = registeredPaths(api);
  const nest = (p: string) => p.replace(/\{\w+\*\}/g, "*").replace(/\{(\w+)\}/g, ":$1");
  return paths.flatMap((p) => [nest(p), nest(p).replace(/^\/api\//, "/api/v1/site/")]).filter((p) => !have.has(p));
}
