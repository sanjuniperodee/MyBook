# 03. План миграции

> **2026-11-05: направление изменено.** Ближайшая цель — модульный монолит + отдельные процессы
> (render, messaging, scheduler) и быстрый CI, без микросервисов и без смены языка:
> [ADR 0009](adr/0009-modular-monolith-with-workers.md). Ниже — target A, он остаётся справкой и
> вариантом на случай триггеров из ADR 0009 §5.

> Оценки — для одного опытного разработчика, знакомого с кодом. Диапазоны, а не обещания.
> Задачи ведутся в [PROGRESS.md](PROGRESS.md); здесь — что именно делать и как понять, что готово.

## 0. Общая логика

Мы идём **не по доменам, а по риску и цене ошибки**:

1. Сначала убираем БД из `web` (волна 1). Это даёт отдельный деплой бэкенда и не трогает бизнес-логику.
2. Потом выносим то, что больнее всего падает и жрёт память: publishing/PDF (волна 2).
3. Потом — внешние интеграции и долгие соединения: conversations (волна 3).
4. Потом — фундамент: identity/access/workspace (волна 4). Его нельзя выносить раньше, пока на
   `users.id` ссылаются все схемы.
5. Потом — LLM (волна 5), потому что это изолированный I/O и его легко отключить.
6. `commerce`/`crm`/`insights` — только если после волны 5 есть реальная причина (волна 6).

Каждая волна заканчивается **гейтом**: production-наблюдение, метрики, отсутствие визуальных диффов.
Без гейта следующая волна не начинается.

## 1. Волна 0 — страховочная сетка (1–2 недели)

Цель: сделать так, чтобы «фронт не изменился» и «данные не поехали» ловилось автоматически, а не
глазами.

| ID | Задача | Результат | Оценка |
|---|---|---|---|
| M0.1 | Инвентаризация | `scripts/microservices/inventory.mjs`, `baseline/inventory.{json,md}` | 0.5 дня |
| M0.2 | План, ADR, PROGRESS, HANDOFF | `docs/microservices/**` | 1 день |
| M0.3 | Playwright-скриншоты админки и кабинета | `playwright.config.ts`, `tests/visual/pages.spec.ts`, seed-скрипт, эталоны | 2–3 дня |
| M0.4 | DTO golden + parity-стенд | `tests/microservices/*`, `PARITY_MODE`, отчёт расхождений | 2–3 дня |
| M0.5 | Каркас монорепо | workspaces, `apps/`, `packages/`, скрипты, path aliases — без переноса кода | 1–2 дня |
| M0.6 | CI-гейты | typecheck, lint, unit, integration (PG/Redis), visual, boundaries, inventory diff | 1–2 дня |
| M0.7 | Релизный манифест и откат | описание версий сервисов, порядок миграций, smoke | 1 день |

### M0.3. Визуальный стенд

Маршруты (минимум):

- клиент: `/`, `/kk`, `/login`, `/kniga/mame`, `/books/new`, `/books/[id]/questions`,
  `/books/[id]/cover`, `/books/[id]/checkout`, `/pay/[token]`, `/gift`;
- админ: `/admin`, `/admin/deals/[id]`, `/admin/clients/[id]`, `/admin/chats`, `/admin/orders`,
  `/admin/production`, `/admin/settings`, `/admin/team`, `/admin/reviews`;
- мобильный API: контрактные тесты, не скриншоты.

Условия детерминизма:

- отдельная тестовая БД, seed-скрипт с фиксированными UUID и датами;
- `TZ=Asia/Almaty`, фиксированное «сегодня» через тестовый флаг (если нельзя — маска дат);
- отключены анимации, курсоры, случайные обложки; `prefers-reduced-motion`;
- маски: текущее время, относительные даты, счётчики, аватары, QR;
- вход — сохранённый `storageState` тестового администратора/клиента;
- ru и kk, desktop 1440×900 и mobile 390×844.

Критерий: `npx playwright test tests/visual` на неизменённом коде — 0 диффов; на коде с
произвольным изменением CSS — падает.

### M0.4. DTO golden + parity

Два независимых механизма:

1. **Golden DTO.** Для ключевых read-моделей (`reporting.dashboard`, `reporting.dealCard`,
   `authoring.queries.bookForEditor`, `ordering.queries.orderDetails`, `messaging.view.chat`) сохранить
   JSON-снимок. При переезде на HTTP сравнить форму и значения (даты — ISO, порядок ключей не важен).
2. **Parity.** `PARITY_MODE=shadow`: BFF вызывает и in-process `container()`, и HTTP-бэкенд, сравнивает
   нормализованные ответы, пишет расхождения `{path, diff, requestId}` в лог/файл. Пользователь видит
   ответ in-process. `PARITY_MODE=strict` — расхождение = 500 (только в тестах/канареечном окружении).

Что нормализуем: `Date` → ISO, `undefined` → отсутствие, порядок массивов (если не гарантирован),
`requestId`, `now`, случайные ID. Всё остальное — расхождение.

### M0.5. Каркас монорепо

Рекомендация: **npm workspaces**, потому что прод уже на npm и `package-lock.json`; переход на pnpm —
отдельное решение, не часть распила. Turborepo — не раньше M1.1, когда появятся два приложения и
станет что кэшировать. Ниже — **целевая** раскладка; на M0.5 создаются только `packages/contracts`,
`packages/platform-kit`, `apps/README.md`, `infra/compose/README.md` (см. [08-monorepo.md](08-monorepo.md)).

```
apps/
  web/          Next.js: страницы, компоненты, actions, BFF
  api/          Next.js (переходный): /api/**, модули, миграции, RPC
services/
  publishing/   Fastify + worker (волна 2)
  conversations/
  platform/
  ai/
packages/
  contracts/    DTO, коды ошибок, схемы событий, OpenAPI-типы
  core/         временно: modules, shared, server (пока не разъехались)
  platform-kit/ env, logger, otel, auth, testing
  config/       eslint/ts/prettier
tests/
  integration/  PG/Redis
  architecture/
  visual/
infra/
  compose/
  nginx/
```

Важно: на M0.5 **ничего не переносим**, только создаём пустые пакеты и проверяем, что `npm test`
и `npm run build` не сломались. Перенос — M1.1, отдельным PR.

### Гейт G0

- `tsc`, `eslint`, `vitest` — зелёные.
- Playwright-эталоны сняты и коммитятся.
- Parity-стенд работает на неизменённом коде (0 расхождений).
- Пользователь подтвердил: target A, бюджет RAM (с учётом соседей по серверу), деплой PM2 vs Compose. S3 решён (Yandex) и нужен только волне 2 — доступ проверяется отдельно, G0 не блокирует.
- В прод ничего не выкатывалось.

## 2. Волна 1 — бэкенд отдельно (3–5 недель)

Цель: `web` не имеет доступа к БД и модулям; `api` — отдельный процесс, который обслуживает `/api/**`
и RPC для SSR/actions. Пользователь не видит разницы.

| ID | Задача | Результат | Оценка |
|---|---|---|---|
| M1.1 | Перенос кода в `apps/web` + `apps/api` + `packages/core` | сборка двух приложений, тесты зелёные | 5–7 дней |
| M1.2 | `container()` → remote proxy | `apps/web/src/server/container.ts` с HTTP-транспортом и in-process fallback | 4–6 дней |
| M1.3 | RPC-эндпоинт в `api` | allowlist методов, superjson, ошибки, internal auth | 2–3 дня |
| M1.4 | Auth-адаптер web → api | `getCurrentUser`, `requireStaff`, 2FA, cookie forwarding | 2–3 дня |
| M1.5 | Маршрутизация `/api/**` | nginx/rewrite на `api`, файлы/SSE/стриминг | 2–3 дня |
| M1.6 | Деплой двух процессов | PM2 `mybook-web`/`mybook-api`, smoke, rollback | 2–3 дня |
| M1.7 | Parity + canary | shadow 3–5 дней, затем `BACKEND_MODE=http` | 3–5 дней |
| M1.8 | Запрет БД в web | lint/test: нет `pg`, `drizzle`, `@/modules/*`, `shared/infrastructure` | 1 день |
| M1.9 | Документация и обучение | runbook, схема, known issues | 1 день |

### M1.1. Что куда переезжает

| Сейчас | Куда | Примечание |
|---|---|---|
| `src/app/api/**` | `apps/api/src/app/api/**` | роуты не переписываем; Next API app |
| `src/app/**` (кроме api) | `apps/web/src/app/**` | страницы, layouts, actions |
| `src/components/**` | `apps/web/src/components/**` | без изменений |
| `src/modules/**` | `packages/core/modules/**` | временно; потом разъедется по сервисам |
| `src/shared/**` | `packages/core/shared/**` | общее ядро |
| `src/server/**` | `packages/core/server/**` + web-адаптеры в `apps/web/src/server` | разделить: auth/books/access — web; container/scheduler — api |
| `src/lib/book/**`, `pdf/**` | `packages/core/lib/**` | нужно publishing и тестам |
| `src/lib/content/**`, `i18n/**` | `packages/content` или `packages/core` | нужно и web, и api |
| `drizzle/**`, `drizzle.config.ts` | `apps/api/drizzle/**` | миграции у api |
| `public/**`, `assets/fonts` | `apps/web/public`, корневой `assets` | шрифты нужны и PDF, и CSS |
| `tests/**` | по владельцу | `tests/architecture`, `tests/integration`, `apps/*/tests` |

Правила переноса:

- Только `git mv`, чтобы сохранить историю.
- Никаких изменений логики в M1.1. Если что-то не собирается — минимальный адаптер, не рефакторинг.
- Сначала переносим и чиним сборку/тесты, потом RPC. Два отдельных PR.
- `apps/api` — минимальное Next-приложение без страниц: `app/api`, `instrumentation`, `next.config`.
- `apps/web` — без `pg`, `drizzle`, `@/modules/*` в runtime; только `import type` из contracts.

### M1.2. Remote proxy: как не переписать 643 вызова

`container()` остаётся функцией с тем же типом. Меняется реализация:

```ts
// apps/web/src/server/container.ts
export function container(): Container {
  return backendMode() === "inprocess" ? inProcessContainer() : remoteContainer();
}
```

`remoteContainer()` — `Proxy`, который:

- по цепочке свойств собирает путь (`ordering.orders.place`);
- возвращает функцию, которая делает `POST /internal/v1/rpc` с `{ path, args }`;
- сериализует аргументы через `superjson` (Date, Map, Set, BigInt, undefined);
- восстанавливает ошибку: `{ code, message, params }` → класс с `is()` (сохранить текущие проверки);
- кэширует «сервисные» объекты, чтобы не создавать Proxy на каждый вызов;
- для методов, возвращающих `Buffer`/`ReadableStream`, не используется — для них отдельные роуты.

Почему не tRPC: RPC-путь должен быть временным швом, а не новым контрактом. tRPC привязал бы web к
реализации api и усложнил бы переход на OpenAPI. RPC — только для миграции; публичные API — REST.

Ограничения:

- Метод не должен возвращать классы с методами (агрегаты). Если возвращает — маппим в DTO на стороне
  api. Список таких методов — в M1.2, каждый закрывается тестом.
- Транзакции не пересекают RPC. Команда = один вызов; если нужно несколько — отдельный сценарий в api.
- Таймаут 30 с для обычных вызовов, 120 с для рендера; retry только для чтения.
- Размер ответа: > 2 МБ — отдельный роут (файлы, PDF).

### M1.3. RPC-эндпоинт

- `POST /internal/v1/rpc` в `apps/api`.
- Заголовки: `x-internal-token` (HMAC тела + timestamp), `x-request-id`, `cookie`/`authorization`.
- Allowlist: только публичные фасады модулей, не `infrastructure`, не репозитории.
- Не логировать тела (PII); логировать path, duration, status, requestId.
- Ошибки: доменный код + HTTP 200/4xx? Лучше HTTP 200 с `{ok:false,error}` для RPC, чтобы прокси не
  превращал доменную ошибку в 500. Web восстанавливает исключение.
- Rate limit по внутреннему токену.

### M1.4. Auth

- `apps/web/src/server/auth.ts` не импортирует `IdentityModule` напрямую; зовёт
  `container().identity.queries.userBySession` через RPC.
- Cookie остаётся на домене; API получает её при RPC/проксировании.
- `startSession`/`destroySession` — через RPC; cookie ставит web.
- 2FA-билет — подписанный `APP_SECRET`, остаётся в web; проверка кода — RPC.
- Staff/access guards — RPC; ответ кэшируется на запрос (`React.cache`).

### M1.5. Маршрутизация

- В dev: Next `rewrites` `/api/:path*` → `http://localhost:3050/api/:path*`.
- В prod: nginx `location /api/ { proxy_pass http://api; }`; остальное — web.
- Исключения: `/api/internal/*` — `deny all`; `/api/health` — api; SSE/файлы — с `proxy_buffering off`.
- Cookie, `X-Real-IP`, `X-Forwarded-*` — пробрасывать.
- Если api недоступен: web отдаёт 503 на API и страницы с данными? Лучше — понятная страница ошибки,
  не белый экран. Добавить health-gate в деплое.

### M1.6. Деплой

- Два standalone-приложения в одном артефакте: `web/server.js`, `api/server.js`.
- PM2: `mybook-web` (3040), `mybook-api` (3050).
- Smoke: `api /api/health`, `web /`, `/kk`, `/login`, сквозной вход, один заказ в тестовой БД.
- Порядок: миграции → api на 3051 → smoke → web на 3041 → smoke → переключение nginx/PM2 → проверка.
- Откат: оба релиза назад; миграции — expand/contract, обратно совместимые.
- Наблюдение 24–48 ч: 5xx, p95, outbox lag, PDF, платежи.

### Гейт G1

- `apps/web` не импортирует `pg`, `drizzle`, `@/modules/*`, `shared/infrastructure` (тест).
- Playwright: 0 визуальных диффов на всех ключевых маршрутах.
- PDF/HTML: 0 диффов.
- Parity: 0 расхождений на проде в shadow за 3–5 дней.
- 5xx не выросли; p95 +<20% (цель +<50 мс); платежи/сообщения без регрессий.
- Неделя в `BACKEND_MODE=http` без инцидентов.
- Откат проверен на staging/локально.

## 3. Волна 2 — publishing + render (3–5 недель)

Цель: книги, фото, письма и PDF живут в отдельном сервисе; рендер — в отдельном worker с очередью.
Падение/утечка PDF не роняет сайт.

| ID | Задача | Результат | Оценка |
|---|---|---|---|
| M2.1 | Схема `publishing`, перенос таблиц | `ALTER TABLE SET SCHEMA`, миграции, бэкап | 3–4 дня |
| M2.2 | Снять FK `publishing → identity/ordering` | `user_id`, `order_id` без FK; тесты | 2–3 дня |
| M2.3 | Fastify API publishing | книги, вопросы, фото, письма, файлы, превью | 7–10 дней |
| M2.4 | Render worker + BullMQ | очередь, прогресс, ретраи, DLQ, лимит памяти | 5–7 дней |
| M2.5 | S3/MinIO | миграция `storage/`, подписанные URL, бэкап | 3–5 дней |
| M2.6 | Переключение `/api/books/**` | nginx, web, editor E2E | 3–4 дня |
| M2.7 | PDF parity | `visual/check.sh`, байт-в-байт, `LAYOUT_VERSION` | 2–3 дня |
| M2.8 | Наблюдаемость | метрики рендера, очередь, RSS, алерты | 1–2 дня |

Критерии:

- PDF на 192 ключах — 0 отличий; `LAYOUT_VERSION` не менялся (или изменение согласовано).
- Редактор: загрузка фото, автосохранение, превью, сборка — E2E зелёные.
- `render-worker` при пике не превышает заданный лимит; web не падает.
- Очередь переживает рестарт; повтор не создаёт дубль PDF.
- Файлы доступны только владельцу/сотруднику с правом (тесты доступа).

## 4. Волна 3 — conversations + notifications (4–6 недель)

Цель: WhatsApp/Instagram/Telegram, почта, веб-чат, звонки, бот и письма — отдельный сервис с
очередями, вебхуками и ретраями. Инбокс и счётчики не теряются.

| ID | Задача | Результат | Оценка |
|---|---|---|---|
| M3.1 | Схема `conversations`, перенос таблиц | миграции, FK сняты | 3–4 дня |
| M3.2 | API: conversations/messages/calls | список, диалог, отправка, вложения, прочтение | 7–10 дней |
| M3.3 | Вебхуки Wazzup/GOWA/email/PBX | подписи, идемпотентность, DLQ | 4–6 дней |
| M3.4 | Исходящие очереди | BullMQ, ретраи, статусы, лимиты | 4–5 дней |
| M3.5 | SSE/live | Redis pub/sub или LISTEN/NOTIFY, прокси | 2–3 дня |
| M3.6 | Бот | перенос QualifierBot, вызовы CRM/platform/ai | 5–7 дней |
| M3.7 | Письма/уведомления | lifecycle, reminders, push/APNs | 3–4 дня |
| M3.8 | Миграция данных и переключение | shadow, canary, откат | 3–5 дней |

Критерии:

- Входящее сообщение создаёт ровно одну заявку/сделку/задачу (идемпотентность).
- Исходящее не дублируется при ретрае; статусы delivered/read совпадают.
- Счётчики непрочитанных и «Мой день» совпадают с текущими.
- SSE переживает рестарт; нет утечек соединений.
- Секреты интеграций не логируются; подписи проверяются.

## 5. Волна 4 — platform: identity/access/workspace (3–5 недель)

Цель: вход, сессии, 2FA, сотрудники, права, настройки — отдельный сервис. Все остальные ссылаются на
`user_id` без FK.

| ID | Задача | Результат | Оценка |
|---|---|---|---|
| M4.1 | Схема `platform`, перенос таблиц | users/sessions/access/workspace | 3–4 дня |
| M4.2 | Снять FK со всех схем на `users` | 51 ключ; код на ID | 5–7 дней |
| M4.3 | API identity/access | login, 2FA, reset, staff, roles, security | 5–7 дней |
| M4.4 | Internal JWT/JWKS | выпуск, проверка, кэш, scopes | 3–4 дня |
| M4.5 | Web auth switch | cookie, guards, редиректы, тексты | 3–4 дня |
| M4.6 | Настройки/шаблоны/поля | API + кэш + инвалидация | 3–4 дня |
| M4.7 | Security-тесты | IP, 2FA, права, аудит | 2–3 дня |

Критерии:

- Вход/выход/2FA/сброс пароля — без регрессий; сессии не теряются при выкатке.
- Матрица прав: сотрудник без права получает 404/403 как раньше.
- IP-allowlist и обязательная 2FA работают.
- Настройки читаются всеми сервисами через API/кэш; секреты не утекают.
- Нет FK на `users` из других схем.

## 6. Волна 5 — ai (2–3 недели)

Цель: все LLM-вызовы идут через один gateway: провайдеры, маршрутизация, лимиты, стоимость, fallback.

| ID | Задача | Результат | Оценка |
|---|---|---|---|
| M5.1 | API gateway | chat/rewrite/proofread/classify | 4–6 дней |
| M5.2 | Провайдеры и fallback | Claude/OpenAI/DeepSeek/OpenAI-compatible | 3–4 дня |
| M5.3 | Лимиты и стоимость | Redis, usage-таблица, бюджеты | 2–3 дня |
| M5.4 | Кэш и дедупликация | одинаковые промпты, TTL | 2 дня |
| M5.5 | Переключение assistant | web/api → ai | 2–3 дня |
| M5.6 | Наблюдаемость | latency/tokens/cost/errors | 1–2 дня |

Критерии:

- Ни один сервис, кроме ai, не хранит ключи провайдеров.
- При 429/529/таймауте — fallback, пользователь видит прежнее поведение.
- Стоимость по дням/моделям видна; лимиты не дают одному клиенту съесть бюджет.
- Нет PII в логах промптов (или маскирование).

## 7. Волна 6 — опционально: commerce / crm / insights (6–10 недель)

Начинать только при выполнении условий из [02-target-architecture.md](02-target-architecture.md#3-target-b-полный-8-деплойментов).

| ID | Задача | Результат |
|---|---|---|
| M6.1 | Саги order↔deal | process manager, компенсации, тесты |
| M6.2 | Саги payment↔invoice/receipt | сверка, идемпотентность |
| M6.3 | Разделение схем `commerce`/`crm` | миграции, снятие FK, ACL |
| M6.4 | Read-модель reporting | проекции из событий |
| M6.5 | `insights` + поиск | Meilisearch/OpenSearch по порогу |
| M6.6 | Сверка денег | ежедневный отчёт + алерт |

Критерии:

- Ежедневная сверка: заказы = платежи = сделки, расхождений 0.
- Сага при сбое шага оставляет компенсируемое состояние, нет «заказ оплачен, сделки нет».
- Отчёты не используют `JOIN` по чужим схемам.
- Поиск: p95 < 200 мс, релевантность не хуже текущей.

## 8. Оценка целиком

| Волна | Диапазон |
|---|---|
| 0 | 1–2 недели |
| 1 | 3–5 недель |
| 2 | 3–5 недель |
| 3 | 4–6 недель |
| 4 | 3–5 недель |
| 5 | 2–3 недели |
| 6 (опция) | 6–10 недель |
| **До target A (0–5)** | **~4–6 месяцев** одного разработчика |
| **До target B (0–6)** | **~6–9 месяцев** |

Параллелить можно: волна 2 (publishing) и волна 3 (conversations) независимы после волны 1;
волна 5 (ai) — почти независима. Но на одном VPS параллельная работа упирается в память и деплой.

## 9. Откат и kill switch

| Волна | Флаг | Откат |
|---|---|---|
| 1 | `BACKEND_MODE=inprocess` | вернуть web на in-process; api можно остановить |
| 2 | `PUBLISHING_MODE=core` | роуты `/api/books/**` обратно в api; worker остановить |
| 3 | `CONVERSATIONS_MODE=core` | вебхуки и инбокс обратно в core; очередь остановить |
| 4 | `PLATFORM_MODE=core` | auth обратно в core; JWT не используется |
| 5 | `AI_MODE=core` | assistant обратно в core |
| 6 | `CORE_SPLIT_MODE=monolith` | слить схемы/роуты обратно (только на время) |

Флаги — env/DB-настройки, не требуют пересборки. После стабилизации флаги удаляются, чтобы не
тащить два пути вечно.

## 10. Определение готовности (Definition of Done)

Для каждой задачи:

- Код + тесты (unit/integration/contract) зелёные.
- Нет новых нарушений границ (architecture test).
- Обновлён `PROGRESS.md` и, если решение архитектурное, ADR.
- Визуальная сверка — 0 диффов (если затронут UI/данные страниц).
- Метрики/логи/трейсы есть для нового пути.
- Откат описан и проверен.
- Секреты/PII не попали в логи и репозиторий.

Для каждой волны:

- Гейт из раздела выше пройден.
- Неделя наблюдения в проде (для волн 1–4).
- Retro: что оказалось дороже, что упростить в следующей волне.
