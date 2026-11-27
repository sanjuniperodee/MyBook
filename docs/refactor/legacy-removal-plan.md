# План: убрать `legacy` и `src/server`, выпрямить раскладку бэкенда

Составлен 27.11.2026 по состоянию `master` c3e6450d. Это продолжение шага 7 ADR 0014: из него удалён `apps/api`,
остались `src/server/container.ts`, `next-shim` и `apps/backend/src/legacy`.

## Статус

| Этап | Состояние |
|---|---|
| 0. Охрана | готово 27.11: `tests/legacy-ratchet.test.ts` + `tests/legacy-ratchet.json` |
| 1. Без Next в `src/server` | готово 27.11 (ветка `refactor/no-next`, не выкачено): `next/*` в бэкенде — 0 файлов, прокладок нет, сборка падает на любом `next/*` (плагин `no-next` в `scripts/node-bundle.mjs`) |
| 2–4 | не начаты |

Итог этапа 1 (как сделано, чтобы не искать по коммитам):
- `revalidatePath`/`revalidateTag` и `"use server"` удалены кодмодом `scripts/refactor/drop-next-cache.mjs`.
- Данные запроса — `src/shared/infrastructure/http/`: `request.ts` (`headers`, `cookies`, `after`, `redirect`, `notFound`,
  `isRedirectError`, `redirectResponse`), `request-scope.ts` (перенесён из `src/server/http`), `locale.ts` (язык запроса
  бэкенда; `src/i18n/server.ts` остаётся вебу). `NextResponse.json` → `Response.json`. Лежит не в `src/server`, чтобы
  код этапа 2 в `src/modules/*/infrastructure` мог им пользоваться.
- Поведение то же, с одним намеренным отличием: ошибка «данные запроса вне HTTP-запроса» теперь английская, как у Next.
  Русская превращалась в обработчиках приложения (`mobile()`) в ответ 400 с текстом разработчика, английская даёт 500.
- Тесты подменяют `@/shared/infrastructure/http/request` и `…/locale` вместо `next/*` и `@/i18n/server`
  (двойники — `tests/doubles/web.ts`). `scripts/refactor/actions.mjs` ищет действия по папке `src/server/crm-actions`.
- `next` в `package.json` пока остаётся: им типизирован общий код веба (`src/i18n/client.tsx`, `src/i18n/server.ts`)
  и тест `tests/stale-version.test.ts`.

## Что сейчас (на 27.11, до этапа 1)

| Где | Объём | Роль |
|---|---|---|
| `apps/backend/src/modules` | 15 контекстов, ~14 тыс. строк | контроллеры Nest — тонкий HTTP-слой |
| `apps/backend/src/legacy` | 19 файлов, ~1,6 тыс. строк, 97 разных импортов `@/server/*` | порты: через них контроллеры зовут старый код |
| `src/server` | 205 файлов, ~20 тыс. строк | старый слой: сервисы, «серверные действия», обработчики сайта, корень композиции |
| `src/modules` | 20 модулей, ~61 тыс. строк | домен (`domain/application/infrastructure/ui`), уже правильный |

`src/server` по частям:

| Часть | Файлов | Строк | С `next/*` |
|---|---|---|---|
| корень (`container.ts`, сервисы `*.ts`) | 90 | 9 845 | 11 |
| `crm-actions/` (бывшие серверные действия CRM, `"use server"`) | 39 | 5 876 | 36 |
| `site-handlers/` (вебхуки Kaspi/CloudPayments/GOWA/АТС/Google, звонки, чеки) | 57 | 1 962 | 42 |
| `crm-ops/`, `crm-lists/`, `api-v1/`, `http/` | 19 | 2 433 | 1 |

`next/*` в бэкенде нужен только этим файлам, и только через прокладки (`src/server/http/next-shim.ts`,
`scripts/next-cache-shim.mjs`, `scripts/worker-next-shim.mjs`):
- `revalidatePath` (272 вызова) — у процесса без Next ничего не делает, прокладка пустая;
- `NextResponse` (156), `headers()` (150), `cookies()` (18) — ответ и данные запроса;
- `notFound()` (56), `redirect()` (40) — ошибки.

Порты `legacy` → что они тянут из `src/server`:

| Порт | Главные зависимости | Сложность |
|---|---|---|
| `feedback`, `ops`, `ops-alerts`, `worker`, `api-process` | только `container` / `scheduler` | малая |
| `orders` | `api-v1/orders` | малая |
| `public` | answerFiles, catalog, kaspi-view, requisites | малая |
| `identity` | account-deletion, book-help, catalog, photos-tab-data, v1-local-bridge* | средняя |
| `authoring` | photo-edit-render, photoLimit | малая |
| `crm-mobile-site` | access, chat-audio, crm-actions/invoices, ios-app, ios-sign, mobile-apk, range-file | средняя |
| `crm-site` | access, audio-convert, boards-api, crm-ops/registry, order-layout, sensitive, support-release | средняя |
| `authoring-site`, `authoring-studio` | answerFiles(+Worker), cover-art/image, design-ai*, pages-image, spell, spreadSample | средняя |
| `crm-admin` | 9 файлов `crm-actions/*`, designAi*, photoLimit | средняя |
| `crm-ops` | 7 файлов `crm-actions/*`, crm-ops/registry, sales-analytics | средняя |
| `crm-core` | `crm-actions/{admin,chats,crm,deals,clients-new}`, `crm-lists/*`, discount, pay-form | большая |
| `crm-mobile-api` | 7 файлов `crm-actions/*`, audio-convert, shift, task-detail | большая |
| `site-ops` | 29 файлов `site-handlers/*`: платежи, вебхуки, звонки | большая, риск денег |

`crm-actions/admin.ts` (647 строк) нужен четырём портам, поэтому его разбирают первым.

## Куда идём

```
mybook-backend/
  src/
    main.ts  worker.ts  app.module.ts   ← из apps/backend/src
    core/                               ← из apps/backend/src/core (+ корень композиции)
    api/<контекст>/                     ← из apps/backend/src/modules (контроллеры, guard-ы, презентеры)
    modules/<домен>/                    домен — как есть, сюда же уезжает логика из src/server
    worker/                             фон
    lib/ i18n/ config/ shared/ book-view/ types/   общий код для веба (пакет mybook-shared) — без изменений
  packages/contracts/                   контракт API v1
  services/files/                       сервис файлов на Go
  tests/                                ← apps/backend/test + tests/backend + tests
  deploy/ drizzle/ scripts/ docs/ assets/
```

Нет `apps/`, `src/server`, `legacy`, прокладок Next и `next` в зависимостях.
HTTP-слой назван `src/api`, а не `src/modules`, чтобы не столкнуться с доменом.

## Этапы

Правило для каждого этапа: `npm test`, `npm run typecheck`, `npx eslint`, `apps/backend/test` (снимки ответов прежнего API
и `boundaries.test.ts`), `npm run build` + `smoke-bundles`. После выкатки — `node scripts/microservices/compare-backend.mjs`
и проверка вебхуков и PDF на сервере. **Выкатка каждого этапа — только после «да» владельца** (AGENTS.md).

### Этап 0. Охрана (полдня)

1. В `tests/architecture-baseline.json` записать число файлов `src/server`, импортов `@/server/*` и файлов с `next/*`.
   Тест падает, если число растёт. Каждый следующий коммит только уменьшает их.
2. Новый код в `src/server` не пишется (правило в AGENTS.md).

### Этап 1. Без Next в `src/server` (1 сессия, механика)

Каждая замена — отдельный коммит с проверкой.

1. Удалить все `revalidatePath`, `revalidateTag` и `"use server"`. Прокладка и так пустая, поведение не меняется.
2. `NextResponse` → `Response` (Web API, Nest 12 отдаёт его как есть).
3. `headers()` / `cookies()` → из `http/request-scope` (AsyncLocalStorage, уже есть), явным параметром.
4. `notFound()` / `redirect()` → ошибки из реестра `src/i18n/api-errors.ts`; `ApiExceptionFilter` уже переводит их в `{ error, code }`.
5. Удалить `src/server/http/next-shim.ts`, `scripts/next-cache-shim.mjs`, `scripts/worker-next-shim.mjs`, алиасы в
   `node-bundle.mjs`, `next-env.d.ts`. `next` и `eslint-config-next` в `package.json` пока оставить: их ещё типизирует `src/i18n`.
   Разобрать отдельно в конце.

Готово, когда: `grep 'from "next/' src` пусто, а снимки ответов совпадают байт в байт.

### Этап 2. Перенос по контекстам (несколько сессий)

Для каждого порта:
1. Код из `src/server/<файл>` → use-case в `src/modules/<домен>/application`, адаптеры → `infrastructure`.
   Отображение остаётся в `ui`. Скопированную логику не держать: старый файл удаляется в том же коммите.
2. Nest-модуль подключает use-case напрямую. `legacy/<контекст>.ports.ts` удаляется.
3. Тесты: снимки ответов и e2e контекста, плюс доменные тесты для того, что переехало.

Очерёдность — от простого и от общего:

| Волна | Что | Почему так |
|---|---|---|
| 2a | `feedback`, `ops`, `orders`, `public`, `authoring` | малые, отрабатываем приём |
| 2b | разобрать `crm-actions/admin.ts` по доменам | им пользуются 4 порта |
| 2c | `identity`, `crm-site`, `crm-mobile-site`, `authoring-site`, `authoring-studio` | средние, мало пересечений |
| 2d | `crm-admin`, `crm-ops` | делят `crm-actions/{settings-crm,team}` — одна сессия |
| 2e | `crm-core`, `crm-mobile-api` | делят `crm-actions/{chats,crm,deals}` — одна сессия, после 2d |
| 2f | `site-ops` (платежи, вебхуки, звонки) | последним: деньги; каждую группу выкатывать отдельно и проверять живым вебхуком |

Волны 2a и 2c можно вести параллельными сессиями по зонам. Внутри зоны файлы не пересекаются; `container.ts`
трогает только одна сессия за раз.

### Этап 3. Корень композиции без `container.ts` (1 сессия)

1. Общее ядро (единица работы с outbox, часы, лимиты, шина) собирается в `core/kernel` провайдерами Nest.
2. Связи модулей из `container.ts` (605 строк: automation ↔ messaging ↔ sales ↔ clients ↔ boards…) → фабрики-провайдеры
   в `core/composition`, по одному на доменный модуль, без сервис-локатора.
3. Воркер: `src/worker/run.ts` (`@/server/background`, `@/server/catalog`) → на те же провайдеры (Nest-воркер уже есть).
   Убрать запасной путь `MYBOOK_WORKER_RUNTIME=legacy` из `deploy.sh` и `ecosystem.config.cjs`, но только после недели работы
   Nest-воркера без отката.
4. Удалить `legacy/`, `container.ts`, `src/server`. В `boundaries.test.ts` запретить `@/server` везде.

### Этап 4. Раскладка (1 сессия, одним `git mv`, когда нет открытых веток)

1. `apps/backend/src/{main,worker,app.module,bootstrap}.ts` → `src/`; `core/` → `src/core`; `modules/` → `src/api`.
2. `apps/backend/test` + `tests/backend` → `tests/` (`tests/api`, `tests/e2e`).
3. Один `tsconfig.json` с `experimentalDecorators` (`apps/backend/tsconfig.json` удалить). Поправить `typecheck`,
   `scripts/build-backend*.mjs`, `scripts/microservices/module-map.mjs`, `boundaries.test.ts`, `crm-core.expected.test.ts`.
4. Проверить, что `scripts/packages/shared-sources.mjs` и `tests/web-boundary.test.ts` не захватывают `src/api` и `src/core`:
   состав пакета перечислен явно, но проверить сборкой веба с новым пакетом (`SHARED_FROM=…`).
5. Удалить остатки: `apps/`, `mobile/` (README «переехало»), `infra/` (пустой README), `packages/platform-kit`
   (2 файла — проверить, кто импортирует), `dist/` (34 МБ, вне git).
6. Обновить README, AGENTS.md, CLAUDE.md, `docs/modules.md`, ADR 0014 (шаг 7 → done). Новое ADR 0015 «раскладка бэкенда без
   `apps/`» (короткое, сменяет таблицу раскладки ADR 0014).

## Риски

- **Платежи и вебхуки (2f).** Ошибка = потерянная оплата. Нужны снимки ответов на каждый обработчик, выкатка по группам,
  живая проверка Kaspi/CloudPayments/GOWA после каждой.
- **Побочные эффекты в `crm-actions`.** Письма, WhatsApp, push, события outbox. Чеклист из `apps/backend/README.md`:
  прочитать код до SQL и событий, записать в коммите, что делает маршрут.
- **Две копии на время переноса.** Не допускать: старый файл удаляется в том же коммите, где появился новый.
- **Этап 4 ломает пути всем открытым веткам.** Делать, когда веток нет, и одним коммитом.

## Что нужно от владельца

- «Да» на выкатку каждого этапа (и каждой группы в 2f).
- Решить, вести ли этап 2 параллельными сессиями по зонам (быстрее) или одной (проще следить).
