# 04. Стек по сервисам и инфраструктурные решения

> Версии клиентов проверены 2026-11-05 (`npm view`). Серверные версии (Postgres, Redis, NATS, MinIO)
> фиксируются в `infra/compose` при реализации, а не в этом документе.

## 1. Общий стек

| Слой | Выбор | Почему |
|---|---|---|
| Язык | TypeScript, Node.js 22 LTS | Уже весь код на TS; переписывание на Go/Rust не даёт выигрыша при текущем объёме |
| HTTP | Fastify 5 для новых сервисов | Меньше overhead и памяти, чем NestJS; явный DI уже есть в коде; Zod-провайдер |
| Переходный API | Next.js 16 route handlers в `apps/api` | Сохраняет 138 роутов без переписывания; см. ADR 0002 |
| Валидация | Zod 4 | Уже в проекте; из неё генерируем OpenAPI/JSON Schema |
| ORM | Drizzle ORM 0.45 | Уже в проекте; миграции и схема по владельцам |
| БД | PostgreSQL 16 | Уже в проекте; FTS/`pg_trgm`, `FOR UPDATE SKIP LOCKED`, advisory locks |
| Кэш/лимиты | Redis 7 | Лимиты, идемпотентность, прогресс, BullMQ, presence |
| Очереди | BullMQ 6 | Ретраи, backoff, DLQ, прогресс, несколько worker'ов |
| События | NATS JetStream 2.x | Лёгкий, durable, at-least-once; без JVM и Erlang |
| Файлы | S3-совместимое (MinIO / внешний S3/R2) | Общий доступ сервисов и worker'ов, подписанные URL, версионирование |
| Логи | pino 10 (JSON) | Быстро, структурно, без магии |
| Трассировка | OpenTelemetry + OTLP | Единый trace через BFF и сервисы |
| Метрики | Prometheus + Grafana | Стандарт; алерты по RED/очередям/outbox |
| Ошибки | Sentry | Фронт + сервисы, release/commit |
| Контракты | OpenAPI 3.1 + `openapi-typescript`/`openapi-fetch` | Понятно вне TS, генерация клиента |
| Монорепо | npm workspaces + Turborepo | Прод на npm; меньше миграции, чем pnpm; кэш сборки |
| Локально | Docker Compose (PG, Redis, NATS, MinIO, Mailpit) | Одинаково у всех; прод — PM2/Compose по решению |
| Прод | PM2 + nginx (сейчас), Docker Compose (позже) | Уже работает; K8s не нужен |

## 2. Стек по сервисам

### web — Next.js BFF/SSR

| Компонент | Выбор |
|---|---|
| Runtime | Next.js 16, React 19, TypeScript |
| Стили | Tailwind CSS 4 (без изменений) |
| Данные | `openapi-fetch` / внутренний RPC-клиент; **без `pg`/`drizzle`** |
| Сессия | Cookie `mb_session`, httpOnly/sameSite/secure; introspection через platform |
| Тесты | Playwright (визуал), Vitest (компоненты/хелперы), существующие page-тесты |
| Деплой | `next build` standalone, PM2 `mybook-web:3040` |

### platform — identity + access + workspace

| Компонент | Выбор |
|---|---|
| Runtime | Fastify 5, Node 22 |
| БД | PostgreSQL, схема `platform` |
| Auth | Свои сессии (как сейчас), `bcryptjs`/argon2, `otplib` для TOTP, `jose` для internal JWT |
| Кэш | Redis: сессии-интроспекция, лимиты, кэш настроек, JWKS-кэш |
| События | NATS: `user.registered`, `staff.changed`, `settings.changed` |
| Секреты | `APP_SECRET` для шифрования интеграций; `.env`/SOPS |
| Тесты | Матрица прав, 2FA, IP-allowlist, аудит |

Почему не Keycloak: у нас свои правила (IP, обязательная 2FA, «только свои» сделки, роли CRM),
миграция пользователей и UX дороже, чем сервис на 1 000 строк.

### core — временный модульный монолит (ordering + sales + clients + automation + feedback + reporting)

| Компонент | Выбор |
|---|---|
| Runtime | Next.js 16 API app (волна 1) → Fastify (волна 6, если делим) |
| БД | PostgreSQL, схема `core` (потом `commerce` + `crm`) |
| Деньги | CloudPayments/Kaspi HTTP, идемпотентность в Redis + БД |
| События | Outbox + NATS; саги — только в волне 6 |
| Отчёты | SQL read-модели; `pg_trgm`/FTS для поиска |
| Тесты | Интеграционные на реальном Postgres (уже есть), сверка денег |

### publishing — authoring + production

| Компонент | Выбор |
|---|---|
| Runtime | Fastify 5 + отдельный `render-worker` |
| БД | PostgreSQL, схема `publishing` |
| Файлы | S3/MinIO; ключи как сейчас (`photos/...`, `pdf/...`) |
| PDF | `@react-pdf/renderer`, `pdf-lib`, `sharp`, `poppler-utils` (pdftoppm) |
| Очередь | BullMQ: `render.book`, `render.preview`, `photo.process`, `pdf.raster` |
| Прогресс | Redis hash + SSE/поллинг; TTL |
| Лимиты | `PDF_CONCURRENCY=1`, `max_memory_restart`, cgroup; отдельный процесс |
| Тесты | `visual/check.sh` (PDF/HTML), E2E редактора, байт-в-байт |

Почему отдельно: PDF — до 1.5 ГБ RSS и 10–60 с; это главный источник OOM и 502 на сайте.

### conversations — messaging + telephony + notifications

| Компонент | Выбор |
|---|---|
| Runtime | Fastify 5 + worker'ы |
| БД | PostgreSQL, схема `conversations` |
| Каналы | Wazzup, GOWA (WhatsApp), IMAP/SMTP (`imapflow`, `nodemailer`), веб-чат, Zadarma/PBX |
| Очереди | BullMQ: `message.send`, `email.send`, `imap.poll`, `gowa.catchup`, `push.send` |
| Live | Redis pub/sub + SSE (или Postgres `LISTEN/NOTIFY`, если без Redis на этом шаге) |
| Идемпотентность | `provider_event_id`, `message_id`, dedupe в Redis + БД |
| Push | `web-push`, APNs (как сейчас) |
| Тесты | Вебхуки с подписью, дубли, ретраи, счётчики, E2E чата |

### ai — LLM gateway

| Компонент | Выбор |
|---|---|
| Runtime | Fastify 5 |
| Провайдеры | Anthropic SDK, OpenAI-совместимый API (ChatGPT/DeepSeek/OpenRouter/свой) |
| Маршрутизация | уровни Haiku/Sonnet/Opus, fallback, таймауты, retry-after |
| Лимиты | Redis (rate limit, бюджет), usage-таблица в Postgres |
| Кэш | Redis: одинаковые промпты/эмбеддинги, TTL |
| Векторы | `pgvector` только если появится RAG; отдельный Qdrant не нужен |
| Тесты | Моки провайдеров, 429/529/timeout, стоимость |

### insights — опционально

| Компонент | Выбор |
|---|---|
| Runtime | Fastify 5 |
| БД | Read replica Postgres или ClickHouse (только при десятках миллионов строк) |
| Поиск | Meilisearch (до OpenSearch); индексы из событий |
| Отчёты | Проекции, materialized views, обновление по расписанию |
| Тесты | Сверка цифр с core, свежесть, p95 |

## 3. Инфраструктура: когда и зачем

### 3.1. Redis — обязателен с волны 2

Сейчас `REDIS_URL` опционален: лимиты и TOTP живут в памяти. С несколькими процессами это ломается
(лимит умножается на число процессов, TOTP-шаг не общий). Redis нужен для:

- rate limit и антибрутфорс (общий на все экземпляры);
- идемпотентность платежей/вебхуков (короткий TTL);
- прогресс рендера и статусы очередей;
- BullMQ;
- presence/SSE и кэш настроек;
- распределённые блокировки (осторожно, лучше advisory locks в PG).

Конфиг: `maxmemory 256mb`, `allkeys-lru`, без persistence для кэша; для очередей — AOF или отдельный
инстанс, если нужна устойчивость к рестарту.

### 3.2. BullMQ — обязателен с волны 2

Очереди, которые нельзя держать в памяти процесса:

| Очередь | Producer | Worker | Ретраи |
|---|---|---|---|
| `render.book` | publishing | render-worker | 3, backoff 30 с |
| `render.preview` | publishing | render-worker | 2 |
| `photo.process` | publishing | render-worker | 3 |
| `message.send` | conversations | conversations-worker | 5, backoff |
| `email.send` | conversations/platform | conversations-worker | 5 |
| `imap.poll` | scheduler | conversations-worker | 3 |
| `push.send` | conversations | conversations-worker | 3 |
| `ai.batch` | ai | ai-worker | 2 |

Прогресс — в Redis `job.progress`; UI читает через SSE/поллинг. DLQ — отдельная очередь + алерт.

### 3.3. NATS JetStream — обязателен с волны 2–3

- Один бинарник, ~50–128 МБ, без JVM/Erlang.
- Durable streams, at-least-once, replay, consumer groups.
- Схема subject: `<service>.<aggregate>.<event>.v1`, например `core.order.paid.v1`.
- Outbox relay: после COMMIT публикует событие; consumer пишет в inbox и обрабатывает.
- DLQ: stream `DLQ` + алерт; ручной replay.
- Почему не RabbitMQ: Erlang-рантайм и управление очередями тяжелее; нам не нужны сложные routing
  topologies. Почему не Kafka: объём и команда не те.

### 3.4. S3/MinIO — обязателен с волны 2

- Локальный `storage/` — общий том; при нескольких сервисах это скрытая связь и точка отказа.
- MinIO на том же хосте: +200–300 МБ, зато S3 API, версионирование, lifecycle.
- Внешний S3/R2: минус память, плюс сеть/стоимость/юрисдикция. Решение — Q2.
- Подписанные URL для браузера; внутренние — credentials.
- Бэкап: версионирование + ежедневный snapshot; проверка восстановления раз в месяц.

### 3.5. Поиск

| Объём/потребность | Решение |
|---|---|
| До ~1 млн строк, поиск по имени/телефону/номеру | Postgres `pg_trgm` + FTS, текущие индексы |
| Нужна опечаточная релевантность, мгновенный поиск | Meilisearch, индекс из событий |
| Логи/аналитика, десятки миллионов документов | OpenSearch (отдельный ADR, бюджет RAM) |
| Elasticsearch | Не используем |

Порог для Meilisearch: жалобы на поиск или p95 > 300 мс на `reporting.search`. До этого — не
добавляем сервис.

### 3.6. Наблюдаемость

- OpenTelemetry SDK в web/api/сервисах; экспорт OTLP в collector (Grafana Agent/Alloy).
- Prometheus scrape `/metrics`; Grafana dashboards.
- Логи pino → stdout → journald/Loki.
- Sentry для ошибок.
- SLO: доступность 99.5%, p95 страницы < 1 с, платёж < 5 с, сообщение < 3 с, PDF < 90 с.
- Алерты: 5xx, p95, outbox lag, queue failed, платежи, PDF, диск, память.

### 3.7. API gateway

- Сейчас nginx: TLS, маршруты, лимиты тела, таймауты, SSE.
- Traefik — только если перейдём на Docker Compose с динамическими сервисами.
- Kong/Envoy — не нужны.

## 4. Что и когда добавлять

| Технология | Волна 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Redis | — | + | + | + | + | + | + |
| BullMQ | — | — | + | + | + | + | + |
| NATS | — | — | + | + | + | + | + |
| S3/MinIO | — | — | + | + | + | + | + |
| OpenTelemetry | — | + | + | + | + | + | + |
| Prometheus/Grafana | — | + | + | + | + | + | + |
| Sentry | — | + | + | + | + | + | + |
| Meilisearch | — | — | — | — | — | — | + |
| OpenSearch | — | — | — | — | — | — | только по ADR |
| Kafka | — | — | — | — | — | — | — |
| K8s | — | — | — | — | — | — | — |

## 5. Отвергнутые варианты

| Вариант | Почему нет |
|---|---|
| Kafka | Объём тысячи событий/сутки; JVM, ZooKeeper/KRaft, эксплуатация. Outbox + NATS проще |
| RabbitMQ | Erlang-рантайм, management UI, routing — избыточно; NATS легче |
| Elasticsearch | 1–2 ГБ RAM минимум, JVM, обслуживание; Postgres хватает |
| Kubernetes | Один VPS; PM2/Compose достаточно; K8s добавит сложности без пользы |
| Service mesh (Istio/Linkerd) | Нет multi-tenancy и сложной сети; mTLS можно добавить позже |
| GraphQL | Клиенты уже REST; GraphQL усложнит кэш/лимиты/контракты |
| gRPC | Нет выигрыша на этом объёме; HTTP/JSON проще отлаживать |
| Keycloak | Свои 2FA/права/IP уже работают; миграция дороже |
| Temporal | Саги пока простые; BullMQ + outbox хватает. Вернуться, если саг станет много |
| 15 сервисов «по контексту» | Распределённый монолит, больше сетевых вызовов и деплоев; не оправдано |
| Database-per-service сразу | 66 FK и reporting по всем схемам; сначала схема на сервис |
| Отдельный API gateway (Kong) | nginx уже есть; Kong — ещё один компонент |
| Микрофронтенды | UI не меняем; нет независимых команд фронта |

## 6. Бюджет памяти (напоминание)

Полный target A — ~5.2–7.3 ГБ RSS. На 8 ГБ с чужими проектами это впритык. До волны 2 нужно
решение: +RAM, вторая машина или внешний S3 + жёсткие лимиты. См.
[02-target-architecture.md](02-target-architecture.md#11-деплой-и-сеть).
