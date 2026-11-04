---
updated: 2026-11-05T04:10:00+05:00
branch: refactor/microservices
wave: 0
task: M0.4
status: pending
next: "Сделать golden DTO и parity-стенд (M0.4), затем каркас монорепо (M0.5)"
blockers:
  - "G0: нужно подтверждение target A и бюджета RAM/деплоя (S3 решён)"
  - "S3: Yandex отвечает 403 SignatureDoesNotMatch — перепроверить/перевыпустить ключи"
---

# PROGRESS — рефакторинг MyBooks на сервисы

> Живой журнал. **Обновляй этот файл после каждой задачи.** Если ты новый агент — сначала
> [README.md](README.md), потом [HANDOFF.md](HANDOFF.md), потом этот файл.

## Сейчас

| | |
|---|---|
| Ветка | `refactor/microservices` |
| Волна | 0 — страховочная сетка |
| Текущая задача | **M0.4 — golden DTO и parity-стенд** |
| Статус | `pending` |
| Следующее действие | Снять golden-снимки ключевых read-моделей и добавить `PARITY_MODE=shadow` для сравнения in-process и HTTP |
| Блокер | G0: target A + RAM/деплой; S3: Yandex 403 SignatureDoesNotMatch |
| Последнее обновление | 2026-11-05 04:10 Asia/Almaty |

### Что уже сделано в этой сессии

- Ветка `refactor/microservices` создана от `master` (`896a123f`).
- Добавлен `scripts/microservices/inventory.mjs`.
- Снят baseline: `docs/microservices/baseline/inventory.{json,md}`.
- Написаны: README, 00-baseline, 02-target-architecture, 03-migration-plan, 04-stack-decisions,
  05-contracts-and-parity, 06-operations, ADR 0001–0007.
- Baseline-проверки: `tsc` — 0, `vitest` — 4010 passed / 135 skipped / 0 failed.
- **M0.3:** Playwright-стенд страниц, seed, фиксированные часы, 40 эталонов (20 страниц × desktop/mobile).
  Два прогона подряд — 40/40; подмена пикселя в эталоне роняет тест. Подробно — `tests/visual/pages.README.md`.
- **S3:** выбран Yandex Object Storage (бакет `mybooks`), профиль `yc-storage` и `S3_*` в `.env.local`
  (ключи вне git). Документы — `07-storage-s3.md`, ADR 0008.
- Код приложения менялся только в тестовой обвязке (`src/instrumentation-node.ts` — часы под `VISUAL_NOW`);
  бизнес-логика и UI не тронуты; в прод ничего не выкатывалось.

## Легенда

| Статус | Значение |
|---|---|
| `todo` | Не начато |
| `in_progress` | В работе, есть ветка/PR |
| `blocked` | Ждёт решения/зависимости; причина в блокерах |
| `done` | Сделано, проверено, закоммичено |
| `canceled` | Отменено, причина записана |

## Волны

| Волна | Статус | Гейт | Заметка |
|---|---|---|---|
| 0 — страховочная сетка | `in_progress` | G0 | baseline, план и визуал готовы; parity/монорепо впереди |
| 1 — web + api | `todo` | G1 | нельзя начинать без G0 |
| 2 — publishing + render | `todo` | G2 | нужен бюджет RAM и S3 |
| 3 — conversations | `todo` | G3 | после стабилизации волны 2 |
| 4 — platform | `todo` | G4 | после снятия FK на users |
| 5 — ai | `todo` | G5 | можно параллельно с 3–4 |
| 6 — commerce/crm/insights | `todo` | G6 | только по условиям из target B |

## Доска задач

### Волна 0

| ID | Задача | Статус | Ветка/PR | Проверка | Заметка |
|---|---|---|---|---|---|
| M0.1 | Inventory + baseline | `done` | `refactor/microservices` | скрипт отработал, JSON/MD созданы | 2026-11-05 |
| M0.2 | План, ADR, PROGRESS, HANDOFF | `done` | `refactor/microservices` `05729c23` | документы linked, `tsc`/`vitest` не трогались | 2026-11-05 |
| M0.3 | Playwright-скриншоты админки/кабинета | `done` | `refactor/microservices` | 40/40 два прогона; diff-пиксель ловится | 2026-11-05 |
| M0.4 | Golden DTO + parity shadow | `pending` | — | 0 mismatches на неизменённом коде | **следующая** |
| M0.5 | Каркас монорепо (без переноса) | `pending` | — | `npm test`/`build` зелёные | после M0.3 |
| M0.6 | CI-гейты | `pending` | — | PR-blocking checks | после M0.5 |
| M0.7 | Релизный манифест и откат | `pending` | — | smoke/rollback описаны | до волны 1 |
| M0.8 | Yandex S3: профиль, ключи, документы | `blocked` | `refactor/microservices` | `head-bucket` → 403 SignatureDoesNotMatch | ключи вне git; нужен перевыпуск/проверка |

### Волна 1 (не начинать без G0)

| ID | Задача | Статус | Зависит от |
|---|---|---|---|
| M1.1 | Перенос кода в `apps/web` + `apps/api` + `packages/core` | `todo` | M0.5 |
| M1.2 | Remote `container()` | `todo` | M1.1 |
| M1.3 | RPC-эндпоинт | `todo` | M1.2 |
| M1.4 | Auth web → api | `todo` | M1.3 |
| M1.5 | Маршрутизация `/api/**` | `todo` | M1.4 |
| M1.6 | Деплой двух процессов | `todo` | M1.5 |
| M1.7 | Parity + canary | `todo` | M1.4, M0.4 |
| M1.8 | Запрет БД в web | `todo` | M1.1 |
| M1.9 | Runbook | `todo` | M1.6 |

### Волны 2–6

См. [03-migration-plan.md](03-migration-plan.md). Задачи M2.x–M6.x добавляются сюда по мере старта,
чтобы не держать в таблице 40 неактивных строк.

## Гейты

| Гейт | Условие | Статус |
|---|---|---|
| **G0** | Baseline/визуал/parity готовы; пользователь подтвердил target A, RAM, S3, деплой | `blocked` |
| **G1** | web без БД; 0 визуальных диффов; неделя `BACKEND_MODE=http` без инцидентов | `todo` |
| **G2** | PDF байт-в-байт; render не роняет web; очередь переживает рестарт | `todo` |
| **G3** | Нет дублей сообщений/заявок; SSE стабилен; вебхуки подписаны | `todo` |
| **G4** | Вход/2FA/права без регрессий; нет FK на users | `todo` |
| **G5** | LLM-ключи только в ai; fallback; стоимость видна | `todo` |
| **G6** | Саги и сверка денег; отчёты без чужих JOIN | `todo` |

## Решения, которые нужны от пользователя

| # | Вопрос | Варианты | Рекомендация | Статус |
|---|---|---|---|---|
| Q1 | Target | A (6 деплойментов) / B (8) / монолит+воркеры | **A** | ждёт |
| Q2 | Память | +4–8 ГБ / вторая машина / внешний S3 + лимиты | +8 ГБ или вторая машина к волне 3 | ждёт |
| Q3 | S3 | ~~MinIO / внешний~~ | **Решено: Yandex Object Storage**, бакет `mybooks`; доступ ждёт проверки ключей | `blocked` |
| Q4 | Деплой | PM2 (как сейчас) / Docker Compose | PM2 на волне 1, Compose — позже | ждёт |

Пока ответов нет, **не начинать волну 1**. Волна 0 (тесты, каркас) безопасна.

## Принятые решения

| # | Решение | ADR |
|---|---|---|
| 1 | 6 деплойментов сейчас, 8 — только при причине | [0001](adr/0001-target-topology.md) |
| 2 | Отдельное Next API-приложение + remote `container()` | [0002](adr/0002-backend-extraction-strategy.md) |
| 3 | Схема на сервис сначала, физическая БД — позже | [0003](adr/0003-data-ownership.md) |
| 4 | Outbox + NATS JetStream + Redis/BullMQ; без Kafka/Rabbit | [0004](adr/0004-events-jobs-cache.md) |
| 5 | Postgres FTS/trgm; Meilisearch позже; без Elasticsearch | [0005](adr/0005-search.md) |
| 6 | Свои сессии + internal JWT; без Keycloak | [0006](adr/0006-auth.md) |
| 7 | Визуальный контракт + golden DTO + shadow | [0007](adr/0007-ui-parity.md) |
| 8 | Yandex Object Storage, бакет `mybooks` | [0008](adr/0008-object-storage.md) |

## Метрики

| Метрика | Baseline 2026-11-05 | Сейчас | Цель волны 1 |
|---|---:|---:|---:|
| TypeScript LOC | 166 199 | 166 199 | без роста > 5% |
| Таблиц | 54 | 54 | 54 |
| FK между схемами | 66 | 66 | 0 к волне 4 |
| Файлов с `container()` | 202 | 202 | 202 (но транспорт HTTP) |
| API-роутов | 138 | 138 | 138 |
| Тестов | 4010 passed | 4010 passed | ≥ 4010 |
| `tsc` | 0 | 0 | 0 |
| Визуальные диффы | — | — | 0 |

## Риски

| # | Риск | Вероятность | Влияние | Мера |
|---|---|---|---|---|
| R1 | Фронт визуально изменится | средняя | высокое | M0.3/M0.4, флаги, канарейка |
| R2 | Деньги/заказы разъедутся при split core | средняя | критическое | core не делим до волны 6; саги/сверка |
| R3 | Не хватит RAM на 8 ГБ | высокая | высокое | бюджет, +RAM/второй хост, лимиты |
| R4 | Деploy станет хрупким | средняя | высокое | манифест, smoke, откат, одна выкатка за раз |
| R5 | Дубли сообщений/событий | средняя | среднее | inbox/идемпотентность, DLQ |
| R6 | Потеря сессий при выносе auth | низкая | высокое | JWT, canary, откат флагом |
| R7 | Расползание RPC в постоянный контракт | средняя | среднее | RPC только волна 1; OpenAPI для сервисов |
| R8 | Нет времени/команды на эксплуатацию | высокая | среднее | 6 сервисов, а не 15; автоматизация |

## Журнал сессий

| Дата | Агент | Что сделано | Проверки | Следующее |
|---|---|---|---|---|
| 2026-11-05 | DeepSeek (DSH) | Baseline, inventory, план, ADR, PROGRESS, HANDOFF; ветка `refactor/microservices`, коммит `05729c23` | `tsc` 0, `vitest` 4010 passed / 135 skipped, `eslint` 0 ошибок | M0.3 Playwright |
| 2026-11-05 | DeepSeek (DSH) | M0.3: Playwright-стенд страниц, seed, фиксированные часы, 40 эталонов | 40/40 два прогона, diff-пиксель ловится, `tsc`/`eslint` зелёные | M0.4 golden DTO + parity |
| 2026-11-05 | DeepSeek (DSH) | S3: Yandex Object Storage, профиль `yc-storage`, `.env.local`, ADR 0008, `07-storage-s3.md` | ключи вне git, права 600; CLI-проверка доступа | M0.8 close, затем M0.4 |

## Как обновлять этот файл

1. В YAML сверху: `updated`, `wave`, `task`, `status`, `next`, `blockers`.
2. В «Сейчас» — та же информация человеческим языком.
3. В таблице задач — статус, ветка/PR, чем проверено, заметка.
4. В «Журнал сессий» — одна строка: дата, агент, что сделано, проверки, следующее.
5. В «Метрики» — только если реально мерил; не копируй старые цифры.
6. Если принял архитектурное решение — ADR + строка в «Принятые решения».
7. Если нашёл блокер — в YAML `blockers` и в «Сейчас»; не прячь в тексте.

**Не удаляй историю.** Завершённые задачи остаются в таблице со статусом `done`; журнал не
переписывается.
