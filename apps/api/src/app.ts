/**
 * Приложение API v1: маршрут контракта → проверка входа и прав → разбор параметров и тела схемами контракта →
 * обработчик (тонкий слой над сервисами модулей) → JSON. Ошибки — в формате сайта ({ error, code }) через тот же
 * api() (src/server/api.ts): тексты на языке пользователя, домен и права — как у веба.
 */
import { openapi, v1, type Input, type Output, type RouteDef, type RouteName } from "@mybook/contracts";
import { api, HttpError } from "@/server/api";
import type { User } from "@/shared/infrastructure/db/schema";
import { createRouter } from "./http/router";

/** Кто вошёл: user — любой вошедший, staff — сотрудник CRM. Подменяется в тестах (инверсия зависимости). */
export interface Authenticator {
  user(req: Request): Promise<User>;
  staff(req: Request): Promise<User>;
}

export interface HandlerContext<N extends RouteName> {
  req: Request;
  /** null только у маршрутов auth: "none". */
  user: User | null;
  input: Input<N>;
}

/** Обработчик маршрута: данные ответа по контракту или готовый Response (особые статусы, например 429). */
export type Handler<N extends RouteName> = (ctx: HandlerContext<N>) => Promise<Output<N> | Response>;
export type Handlers = { [N in RouteName]: Handler<N> };

const router = createRouter(v1);
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

async function readInput(req: Request, route: RouteDef, params: Record<string, string>): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {};
  if (route.params) Object.assign(input, route.params.parse(params));
  if (route.query) Object.assign(input, route.query.parse(Object.fromEntries(new URL(req.url).searchParams)));
  if (route.body) input.body = route.body.parse(await req.json());
  if (route.files) {
    const form = await req.formData().catch(() => {
      throw new HttpError(400, "badRequest");
    });
    input.files = form.getAll(route.files.field).filter((f): f is File => f instanceof File && f.size > 0);
  }
  return input;
}

export function createApp(handlers: Handlers, auth: Authenticator) {
  let spec: string | null = null;
  return async function handle(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/v1/health") return json({ ok: true });
    if (pathname === "/api/v1/openapi.json") return new Response((spec ??= JSON.stringify(openapi())), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
    const found = router.match(req.method, pathname);
    if (!found) return json({ error: "Not found", code: "notFound" }, 404);
    if ("allowed" in found) return new Response(null, { status: 405, headers: { allow: found.allowed.join(", ") } });
    const { name, route, params } = found;
    return api(async () => {
      const user = route.auth === "staff" ? await auth.staff(req) : route.auth === "user" ? await auth.user(req) : null;
      const input = await readInput(req, route, params);
      const handler = handlers[name] as Handler<RouteName>;
      const out = await handler({ req, user, input: input as Input<RouteName> });
      if (out instanceof Response) return out;
      // Вне прода ответ сверяется с контрактом: расхождение — 500 (ошибка сервера, не данных клиента) и падение теста.
      if (process.env.NODE_ENV !== "production") {
        const check = route.response.safeParse(out);
        if (!check.success) throw new Error(`Ответ ${name} не по контракту: ${check.error.message}`);
      }
      return json(out);
    })(req, undefined);
  };
}
