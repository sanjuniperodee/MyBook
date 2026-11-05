# 01. Решения и открытые вопросы

> Короткая выжимка. Полные обоснования — в ADR; детали — в
> [02-target-architecture.md](02-target-architecture.md).

## Принятые решения (предложены, ждут G0)

| # | Решение | Почему | Последствия | ADR |
|---|---|---|---|---|
| D1 | 6 деплойментов сейчас, 8 — только при причине | 15 сервисов на 8 ГБ — распределённый монолит и операционная нагрузка без пользы | target A: web, platform, core, publishing, conversations, ai | [0001](adr/0001-target-topology.md) |
| D2 | Сначала отдельное Next API-приложение, потом Fastify-сервисы | Сохраняет 138 роутов и 38 actions без переписывания; UI не трогаем | RPC-шов, два процесса, +память | [0002](adr/0002-backend-extraction-strategy.md) |
| D3 | Схема на сервис в одной БД, физическое разделение позже | 66 FK и reporting не дают сразу разделить базы | `ALTER TABLE SET SCHEMA`, снятие FK, тесты ownership | [0003](adr/0003-data-ownership.md) |
| D4 | Outbox + NATS JetStream; Redis + BullMQ; без Kafka/Rabbit | Тысячи событий/сутки; NATS легче, outbox уже есть | +NATS, +Redis, relay/inbox/DLQ | [0004](adr/0004-events-jobs-cache.md) |
| D5 | Postgres FTS/trgm сейчас; Meilisearch позже; без Elasticsearch | ES съедает 1–2 ГБ и не нужен на текущем объёме | поиск остаётся в core/insights | [0005](adr/0005-search.md) |
| D6 | Свои сессии + internal JWT; без Keycloak | Свои 2FA/права/IP уже работают; миграция дороже | JWKS, introspection, кэш | [0006](adr/0006-auth.md) |
| D7 | Визуальный контракт + golden DTO + shadow | Скриншоты не ловят DTO/API; нужны все четыре уровня | Playwright, golden, parity, флаги | [0007](adr/0007-ui-parity.md) |
| D8 | Yandex Object Storage, бакет `mybooks` | Уже создан; не занимает RAM; S3 API, versioning/lifecycle | Ключи вне git; подписанные URL; миграция `storage/` | [0008](adr/0008-object-storage.md) |

## Открытые вопросы (нужно решение пользователя)

| # | Вопрос | Варианты | Рекомендация | Почему важно |
|---|---|---|---|---|
| Q1 | Target | A / B / монолит+воркеры | **A** | Определяет объём и сроки |
| Q2 | RAM | +4–8 ГБ / вторая машина / внешний S3 + лимиты | +8 ГБ или вторая машина к волне 3 | target A ~5.1–7.1 ГБ RSS |
| Q3 | S3 | ~~MinIO / внешний~~ | **Решено: Yandex Object Storage**, бакет `mybooks` | Фото/PDF, бэкапы, несколько сервисов |
| Q4 | Деплой | PM2 / Docker Compose | PM2 на волне 1, Compose позже | Скорость и риск выкатки |

## Когда пересматривать

| Триггер | Что пересмотреть |
|---|---|
| PDF стабильно < 500 МБ и нет OOM | Можно отложить publishing-воркер, но изоляция всё равно полезна |
| Заказов/сообщений в 10× больше | NATS/Redis/очереди, possibly Kafka; `core` split |
| Появилась команда/подрядчик на CRM | `crm` extraction раньше, чем волна 6 |
| Нужен поиск с опечатками | Meilisearch, не Elasticsearch |
| Нужны внешние потребители событий | Публичный stream/вебхуки, контракты событий |
| Появился второй хост | mTLS, отдельные БД, S3, деплой |
| 8 ГБ перестало хватать | +RAM/вторая машина; не «оптимизировать» за счёт надёжности |

## Что не пересматриваем без нового ADR

- Отказ от outbox в пользу «просто publish в брокер».
- Database-per-service до снятия FK и read-модели reporting.
- Kafka/Elasticsearch/Kubernetes/Keycloak/GraphQL/gRPC.
- Переписывание UI или микрофронтенды.
