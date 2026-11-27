# mybook-backend — API v1 на NestJS + Fastify (ADR 0014)

Весь бэкенд MyBooks — единый процесс NestJS 12 + Fastify (`127.0.0.1:3046`); прежний `apps/api` удалён (шаг 7).
Архитектурное решение и порядок переезда — [`docs/microservices/adr/0014-nestjs-backend.md`](../../docs/microservices/adr/0014-nestjs-backend.md).
Образец готового контекста — `src/modules/feedback/*` и тесты `test/feedback.e2e.test.ts`, `test/feedback.expected.test.ts`.

## Команды проверки

```bash
npx vitest run apps/backend/test                # e2e, границы и ожидаемые ответы (снимки) без БД
npx tsc --noEmit && npx tsc --noEmit -p apps/backend  # проверка типов (в backend включены experimentalDecorators)
npx eslint apps/backend                          # линтер без any и неиспользуемых переменных
```

Проверка полной standalone-сборки (на чистом архиве HEAD без симлинков worktree):

```bash
rm -rf /tmp/mb-build && mkdir -p /tmp/mb-build
git archive HEAD | tar -x -C /tmp/mb-build
cd /tmp/mb-build && npm ci --no-audit --no-fund && npm run build
```

После деплоя на сервере (`127.0.0.1:3044` ↔ `127.0.0.1:3046`):

```bash
node scripts/microservices/compare-backend.mjs
```

---

## Чеклист до начала кода

1. Прочитать старый код в `src/server/*` целиком — до SQL/репозиториев, доменных событий, писем, WhatsApp/push, сброса кэша и кодов ошибок.
2. Зафиксировать в сообщении коммита: что делает каждый маршрут (вход, права, ответ, побочные эффекты, ошибки). Не переносить то, что не проверено в коде.
3. Не копировать логику: отображение/форматирование, нужное обоим процессам, выносится в чистый модуль (`src/modules/<context>/ui`, `src/lib/*`, `src/shared/*`).

---

## Правила модуля NestJS

### 1. Структура `apps/backend/src/modules/<context>/`

- `<context>.module.ts` — связывает контроллеры, query/use-case, guard-ы и порты; импортирует `LegacyModule`, пока смежные контексты живут в старом контейнере.
- `<context>.tokens.ts` — `Symbol("...")` токены для внедряемых портов и фасадов.
- `<name>.controller.ts` — тонкий транспортный слой: декоратор маршрута, guard-ы ресурса, `@RateLimit(...)`, вызов фасада/query и презентер. Бизнес-логика остаётся в `src/modules/<context>/{domain,application}` и `*.query.ts`.
- **Границы (`test/boundaries.test.ts`)**:
  - Запрещены импорты `next/*`, `react`, `server-only`.
  - Импорты `@/server/*` разрешены **только** в `src/legacy/*` (адаптеры к старому контейнеру).
  - Домен не зависит от `@nestjs/*`.
  - **Каждый параметр конструктора** класса с `@Injectable()` или `@Controller()` должен иметь явный `@Inject(TOKEN)` (esbuild не пишет `emitDecoratorMetadata`). Не используйте вложенные круглые скобки внутри типов параметров конструктора.
  - Никаких `any` и небезопасных `as`-приведений на HTTP-границе.

### 2. Декораторы маршрутов

- **Маршруты контракта (`/api/v1/...`)**:
  - `@Endpoint("<routeName>")` из `core/http/endpoint` — берёт метод, путь, zod-схемы входа и ответа из `@mybook/contracts`. Вне прода ответ автоматически сверяется со схемой контракта; GET получает `ETag` и отдаёт `304` на `If-None-Match`.
  - `@Input() input: Parsed<"<routeName>">` и `@RequestLocale() locale: Locale` из `core/http/decorators`.
  - Возвращаемый тип — `Promise<Output<"<routeName>">>`.
- **Маршруты сайта вне контракта (`/api/...` и `/api/v1/site/...`)**:
  - `@SiteRoute(method, "/api/...", { auth, csrf?, allowUnconfigured2fa?, etag? })` из `core/http/site-route`. Регистрирует маршрут одновременно на `/api/...` и `/api/v1/site/...`, поддерживает `{id}` и хвост `/{path*}` (и точный префикс, и `/*`), автоматически подключается в `SiteRouteRegistry` для `405 Allow`.
  - `@RawBody() raw: Buffer` — немодифицированные байты тела (`application/json`, `x-www-form-urlencoded`, `text/plain`) для проверки HMAC-подписей вебхуков; битый JSON на маршрутах сайта не падает до контроллера.
  - Можно возвращать Web `Response` (потоки `ReadableStream`, `206 Range`, бинарные файлы, SSE `text/event-stream`, несколько `Set-Cookie`) — NestJS 12 стримит его без буферизации.

### 3. Порядок глобальных проверок, вход и права

В `CoreModule` зафиксирован глобальный конвейер (паритет с `mybook-api`):

1. `SessionGuard` — проверяет `Origin`/`Host` (CSRF), читает `mb_session` cookie или `Authorization: Bearer ...` → кладёт `req.user` (`@CurrentUser()`), иначе `401`. Маршрут без `@Endpoint`/`@SiteRoute`/`@Public()` закрыт `403`.
2. `StaffGuard` — для `auth: "staff"` проверяет роль, отключение, IP-allowlist (включая подписанный `x-mb-client-ip` с `EDGE_IP_SECRET`) и обязательную 2FA → кладёт `req.staff` (`@CurrentStaff()`), иначе `403`. Для маршрутов настройки 2FA добавьте `@AllowUnconfigured2fa()`.
3. `ContractInputGuard` — разбирает `params`, `query`, `body`, `files` по схемам `@mybook/contracts` (`400` до проверки ресурсных прав/лимитов, но после проверки статуса сотрудника).
4. `PermissionsGuard` — проверяет `@Permissions("...", ...)` по `req.staff`.
5. Guard-ы контроллера и `@RateLimit(...)` — проверка владения ресурсом, затем лимит частоты (чужой ресурс не должен тратить лимит).

---

## Обязательные тесты и шаблон e2e + ожидаемые ответы

Для каждого перенесённого маршрута проверяются:

- успех (`200`),
- отсутствие входа / чужой Origin (`401` / `403`),
- права роли / 2FA / чужой ресурс (`403` / `404`),
- неверный вход / параметры / файл (`400`),
- не найден (`404`) и неверный метод (`405` с `Allow`),
- для мутаций — состояние БД/портов и ушедшие доменные события/сигналы,
- ответ байт в байт (статус, тело, `ETag`/`304`, `Cache-Control`, `Allow`, `Set-Cookie`, файлы и переходы) против снимка через `assertRoute` из `test/expected.ts` (снимки контекстов, перенесённых до шага 7, записаны с прежнего `mybook-api`).

### Шаблон `<context>.e2e.test.ts` (+ `<context>.expected.test.ts`)

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { bootTestApp, sessionOf, testUser } from "./app";

// 1. Фикстуры и моки портов контекста
const USER = testUser("11111111-1111-4111-8111-111111111111");
const asUser = { cookie: `mb_session=${sessionOf(USER)}` };
let app: Awaited<ReturnType<typeof bootTestApp>>["app"];

beforeAll(async () => {
  ({ app } = await bootTestApp({
    users: [USER],
    overrides: [/* [PORT_TOKEN, mockPort] */],
  }));
});
afterAll(() => app.close());

describe("контекст <Name>", () => {
  it("200 / 401 / 403 / 400 / 404 / 405", async () => {
    const ok = await app.inject({ method: "GET", url: "/api/v1/...", headers: asUser });
    expect(ok.statusCode).toBe(200);
  });
});
```

Ответ байт в байт по снимку (`<context>.expected.test.ts`): первый прогон `npx vitest run <файл> -u` пишет
`__snapshots__/<файл>.snap`, дальше любое расхождение — осознанное изменение API (смотреть дифф снимка):

```ts
import { assertRoute } from "./expected";

await assertRoute({ nest: app, method: "GET", url: "/api/v1/...", headers: asUser });
```

---

## Выкатка и переключение трафика в прод

1. Все проверки зелёные (`typecheck`, `eslint`, полный `vitest run`, `/tmp/mb-build`).
2. Пуш в `master` выкатывает `mybook-backend` на `127.0.0.1:3046` без трафика (автооткат при сбое).
3. Проверка на проде: `node scripts/microservices/compare-backend.mjs`.
4. Включение теневой сверки для перенесённых GET: `MYBOOK_NEST_SHADOW=on` на `mybook-api` → убедиться в 0 расхождений в логах на окне реального трафика и отсутствии новых ошибок в `pm2 logs mybook-backend`.
5. Переключение трафика контекста на проде: раскомментировать соответствующий блок в `/etc/nginx/snippets/mybook-nest-contexts.conf` и выполнить `sudo nginx -t && sudo systemctl reload nginx`.
   - Аварийный откат в 1 строку: закомментировать блок контекста (или `include snippets/mybook-nest-contexts.conf;` в `sites-available/mybooks-kz`) → `sudo nginx -t && sudo systemctl reload nginx`.
