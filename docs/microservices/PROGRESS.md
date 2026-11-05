---
updated: 2026-11-05T07:00:00+05:00
branch: refactor/microservices
wave: P
task: —
status: done
next: "План P0–P7 закрыт. Дальше — только по триггерам ADR 0009 §5 или если лог таймингов покажет p95 > 300 мс вне окна выкатки"
blockers:
  - "S3: Yandex отвечает 403 SignatureDoesNotMatch — проверить секрет (нужен только волне 2, G0 не блокирует)"
---

# PROGRESS — рефакторинг MyBooks на сервисы

> Живой журнал. **Обновляй этот файл после каждой задачи.** Если ты новый агент — сначала
> [README.md](README.md), потом [HANDOFF.md](HANDOFF.md), потом этот файл.

## Сейчас

| | |
|---|---|
| Ветка | `refactor/microservices` |
| Волна | P — модульный монолит + процессы ([ADR 0009](adr/0009-modular-monolith-with-workers.md)) |
| Текущая задача | **нет — план P0–P7 закрыт** |
| Статус | `done` |
| Следующее действие | Наблюдать `mybook-worker` (`pm2 logs mybook-worker`); пересмотр — по триггерам ADR 0009 §5 или по логу таймингов (perf.md) |
| Блокер | нет (S3: Yandex 403 — для текущего плана не нужен) |
| Последнее обновление | 2026-11-05 12:00 Asia/Almaty |

### Что уже сделано в этой сессии

- Ветка `refactor/microservices` создана от `master` (`896a123f`).
- Добавлен `scripts/microservices/inventory.mjs`.
- Снят baseline: `docs/microservices/baseline/inventory.{json,md}`.
- Написаны: README, 00-baseline, 02-target-architecture, 03-migration-plan, 04-stack-decisions,
  05-contracts-and-parity, 06-operations, ADR 0001–0007.
- Baseline-проверки: `tsc` — 0, `vitest` — 4010 passed / 135 skipped / 0 failed.
- **M0.3:** Playwright-стенд страниц, seed, фиксированные часы, 40 эталонов (20 страниц × desktop/mobile).
  Два прогона подряд — 40/40; подмена пикселя в эталоне роняет тест. Подробно — `tests/visual/pages.README.md`.
- **M0.4:** golden DTO (8 read-моделей, `tests/microservices/golden/`) + parity-скелет
  (`src/server/parity.ts`, 14 тестов). `golden:check` — 0 mismatch дважды; `PARITY_MODE` в `.env.example`.
- **S3:** выбран Yandex Object Storage (бакет `mybooks`), профиль `yc-storage` и `S3_*` в `.env.local`
  (ключи вне git). Документы — `07-storage-s3.md`, ADR 0008.
- Код приложения менялся только в тестовой обвязке (`src/instrumentation-node.ts` — часы под `VISUAL_NOW`);
  бизнес-логика и UI не тронуты; в прод ничего не выкатывалось.
- **M0.5:** npm workspaces (`apps/*`, `packages/*`), заготовки `@mybook/contracts`, `@mybook/platform-kit`,
  README в `apps/` и `infra/compose/`; `08-monorepo.md`. Код не переносился.
- **Ревью плана:** [09-review-2026-11-05.md](09-review-2026-11-05.md) — вопросы к G0; расхождения в 01–06 поправлены.

## Направление после ADR 0009

Владелец поручил взвесить варианты и решить (2026-11-05). Решение — [ADR 0009](adr/0009-modular-monolith-with-workers.md):
модульный монолит + отдельные процессы PM2 из той же кодовой базы; скорость выкатки — через CI;
TypeScript на Node, без Go и Bun/Deno. Target A (волны 1–6 ниже) отложен и остаётся справкой.

Что выяснилось при разборе кода (2026-11-05):

- Фоновые проходы (`src/server/scheduler.ts`) уже под advisory-блокировками Postgres, живые обновления CRM —
  через `LISTEN/NOTIFY`, у планировщика есть `SCHEDULER=off`. Код готов к нескольким процессам.
- «Переписка» в фоне — это проходы того же планировщика (IMAP, сверка GOWA, бот, ретраи); вебхуки приходят по
  HTTP в web. Поэтому P5 и P6 — **один** процесс `mybook-worker`, а не два.
- PDF уже верстается в `worker_threads` (`production/infrastructure/pdf/pool.ts`), но без лимита памяти: тяжёлая
  книга раздувает весь процесс сайта до `max_memory_restart` 4000M → 502. Отдельный процесс для рендера не нужен,
  нужен лимит потока.
- В БД в обход модулей ходят 5 файлов, а не 17 (11 импортируют только типы строк): `src/server/designAiStore.ts`,
  `designAiStats.ts`, `answerFiles.ts`, `answerFilesWorker.ts`, `client-mail.ts`. Линтер держит `src/app`,
  `src/components`, `src/lib`, но не `src/server`.
- Сборка в CI ~1 мин, тесты 4–6 мин (половина — 4 PDF-теста), всё последовательно в одном job.

| ID | Задача | Шаги | Проверка | Статус |
|---|---|---|---|---|
| P1 | Быстрый CI | job-ы `types`, `lint`, `test` (5 частей: 2 PDF + 3 шарда), `build` параллельно; `deploy` ждёт все и только для master; на PR — без выкатки | прогон 1: 6,9 мин (было 8–15); узкое место «остальные» 306 с → шарды | `done` (`e7b11711`, `edee0e88`) |
| P6 | Процесс `mybook-worker` (бывшие P5+P6) | `src/worker/main.ts` + `scripts/build-worker.mjs` (заглушка next/*); `MYBOOK_BACKGROUND=worker` у сайта; PM2 `mybook-worker`; `deploy.sh` возвращает фон в сайт, если воркер не поднялся; `MYBOOK_WORKER=off` — откат | воркер + сервер вместе на тестовой базе; тесты конфигурации PM2 | `done` (`edee0e88`) |
| P4 | Лимит памяти потока PDF | `resourceLimits.maxOldGenerationSizeMb` = 2048 (как неявный предел V8 на сервере, 2096), `PDF_WORKER_HEAP_MB` | тест: поток с 32 МБ падает, задача — ошибка, следующая идёт | `done` (`edee0e88`) |
| P2 | Границы `src/server` | ESLint: `src/server` не ходит в БД (кроме `container.ts`, `scheduler.ts`); дизайнер → authoring + reporting, письмо о платеже → identity, свои видео/аудио → authoring (`HttpError` → `AuthoringError`, те же статусы) | храповик пуст; интеграционные тесты дизайнера и видео на базе; статусы 415/413/503/409/422/402 | `done` |
| P3 | Карта модулей | `scripts/microservices/module-map.mjs` → `docs/modules.md`, тест свежести | `tests/module-map.test.ts` | `done` |
| P7 | Замер скорости | внешний TTFB 114 страниц sitemap (сервер ~12 мс в среднем, худшая ~50 мс); лог таймингов nginx `/var/log/nginx/mybook-timing.log`; `scripts/perf/route-latency.mjs` (SSE пропускает); реальный трафик редактора и CRM — p95 ≤ 65 мс | perf.md: таблицы и выводы; узкого места нет, заметно только окно выкатки (~0,5 с) | `done` |
| P0 | Влить в master | владелец разрешил пуш в master 05.11; выкатка поэтапно | прогоны CI зелёные, прод отвечает | `done` |

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
| 0 — страховочная сетка | `done` | G0 | baseline, визуал, golden/parity, каркас; G0 решён ADR 0009 (монолит + воркер) |
| 1 — web + api | `canceled` | G1 | target A отложен ADR 0009; вернуться только по триггерам §5 |
| 2 — publishing + render | `canceled` | G2 | target A отложен ADR 0009; вернуться только по триггерам §5 |
| 3 — conversations | `canceled` | G3 | target A отложен ADR 0009; вернуться только по триггерам §5 |
| 4 — platform | `canceled` | G4 | target A отложен ADR 0009; вернуться только по триггерам §5 |
| 5 — ai | `canceled` | G5 | target A отложен ADR 0009; вернуться только по триггерам §5 |
| 6 — commerce/crm/insights | `canceled` | G6 | target A отложен ADR 0009; вернуться только по триггерам §5 |

## Доска задач

### Волна 0

| ID | Задача | Статус | Ветка/PR | Проверка | Заметка |
|---|---|---|---|---|---|
| M0.1 | Inventory + baseline | `done` | `refactor/microservices` | скрипт отработал, JSON/MD созданы | 2026-11-05 |
| M0.2 | План, ADR, PROGRESS, HANDOFF | `done` | `refactor/microservices` `05729c23` | документы linked, `tsc`/`vitest` не трогались | 2026-11-05 |
| M0.3 | Playwright-скриншоты админки/кабинета | `done` | `refactor/microservices` `8c268531` | 40/40 два прогона; diff-пиксель ловится | 2026-11-05 |
| M0.4 | Golden DTO + parity shadow | `done` | `refactor/microservices` `08ac5a7e` | 8 golden, 0 mismatch дважды; 14 parity-тестов | 2026-11-05 |
| M0.5 | Каркас монорепо (без переноса) | `done` | `refactor/microservices` | `tsc` 0, `vitest` 4023 passed, `next build` зелёный | 2026-11-05; Turborepo отложен до M1.1 |
| M0.6 | CI-гейты | `done` | `e7b11711` | проверки на PR без выкатки, выкатка ждёт все | сделано как P1 |
| M0.7 | Релизный манифест и откат | `done` | `edee0e88` | `BUILD_SHA` в релизе, smoke на 3041, откат в `deploy.sh`, `MYBOOK_WORKER=off` | для монолита достаточно; манифест сервисов не нужен (ADR 0009) |
| M0.8 | Yandex S3: профиль, ключи, документы | `canceled` | `refactor/microservices` | `head-bucket` → 403 SignatureDoesNotMatch | S3 нужен был волне 2 target A; по ADR 0009 не нужен. Вернуться, если понадобится вынос файлов с диска |

### Волна 1 (не начинать без G0)

| ID | Задача | Статус | Зависит от |
|---|---|---|---|
| M1.1 | Перенос кода в `apps/web` + `apps/api` + `packages/core` | `canceled` | M0.5 |
| M1.2 | Remote `container()` | `canceled` | M1.1 |
| M1.3 | RPC-эндпоинт | `canceled` | M1.2 |
| M1.4 | Auth web → api | `canceled` | M1.3 |
| M1.5 | Маршрутизация `/api/**` | `canceled` | M1.4 |
| M1.6 | Деплой двух процессов | `canceled` | M1.5 |
| M1.7 | Parity + canary | `canceled` | M1.4, M0.4 |
| M1.8 | Запрет БД в web | `canceled` | M1.1 |
| M1.9 | Runbook | `canceled` | M1.6 |

### Волны 2–6

См. [03-migration-plan.md](03-migration-plan.md). Задачи M2.x–M6.x добавляются сюда по мере старта,
чтобы не держать в таблице 40 неактивных строк.

## Гейты

| Гейт | Условие | Статус |
|---|---|---|
| **G0** | Baseline/визуал/parity готовы; пользователь подтвердил target A, RAM, S3, деплой | `done` — решён ADR 0009 |
| **G1** | web без БД; 0 визуальных диффов; неделя `BACKEND_MODE=http` без инцидентов | `canceled` — target A отложен |
| **G2** | PDF байт-в-байт; render не роняет web; очередь переживает рестарт | `canceled` — target A отложен |
| **G3** | Нет дублей сообщений/заявок; SSE стабилен; вебхуки подписаны | `canceled` — target A отложен |
| **G4** | Вход/2FA/права без регрессий; нет FK на users | `canceled` — target A отложен |
| **G5** | LLM-ключи только в ai; fallback; стоимость видна | `canceled` — target A отложен |
| **G6** | Саги и сверка денег; отчёты без чужих JOIN | `canceled` — target A отложен |

## Решения, которые нужны от пользователя

| # | Вопрос | Варианты | Рекомендация | Статус |
|---|---|---|---|---|
| Q1 | Target | A (6 деплойментов) / B (8) / монолит+воркеры | **монолит + mybook-worker** | решено: владелец поручил решить, ADR 0009 |
| Q2 | Память | +4–8 ГБ / вторая машина / внешний S3 + лимиты | хватает 8 ГБ: +187 МБ воркер, −110 МБ Daiyn | решено ADR 0009 |
| Q3 | S3 | ~~MinIO / внешний~~ | Yandex Object Storage выбран, но по ADR 0009 не нужен; ключи — 403 | отложено |
| Q4 | Деплой | PM2 (как сейчас) / Docker Compose | PM2 | решено: PM2, `mybook` + `mybook-worker` |

Все вопросы решены ADR 0009 (2026-11-05). Волна 1 target A не начинается.

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
| Тестов | 4010 passed | 4042+ passed | ≥ 4010 |
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
| 2026-11-05 | DeepSeek (DSH) | S3: Yandex Object Storage, профиль `yc-storage`, `.env.local`, ADR 0008, `07-storage-s3.md`; коммит `8c268531` | ключи вне git, права 600; Yandex вернул 403 SignatureDoesNotMatch | M0.8 blocked (ключи), затем M0.4 |
| 2026-11-05 | DeepSeek (DSH) | M0.4: golden DTO 8 моделей, parity-скелет, тесты; коммит `08ac5a7e`; S3: новые ключи, CLI и AWS SDK path-style — снова 403 | 8/8 golden дважды, 14 parity-тестов, `tsc` 0, полный `vitest` 4023 passed | M0.5 каркас монорепо |
| 2026-11-05 | Claude Opus 5.5 | P4+: поток PDF закрывается после 10 мин простоя (`PDF_WORKER_IDLE_MIN`, 0 — не закрывать): `mybook` держал 1,6 ГБ без вёрстки | тест простоя в `pdf-pool-limits`, полный vitest 4043 passed | замер памяти на проде |
| 2026-11-05 | Claude Opus 5.5 | P7 закрыт: 114 страниц sitemap и реальный трафик по логу nginx — узкого места нет, p95 ≤ 65 мс; находка — окно выкатки ~0,5 с | `route-latency` тесты | план закрыт |
| 2026-11-05 | Claude Opus 5.5 | P0–P6 выкачены: параллельный CI, `mybook-worker`, лимит потока PDF, границы `src/server` (5 файлов → модули), карта модулей, лог таймингов nginx; Daiyn на сервере остановлен по просьбе владельца | tsc 0, eslint 0 ошибок, vitest 4042+ на чистом TMPDIR, интеграционные тесты дизайнера и видео, next build | P7: неделя наблюдения |
| 2026-11-05 | Claude Opus 5.5 | Замер CI (тесты 224–351 с из 8–15 мин, сборка ~1 мин); решение ADR 0009: монолит + процессы, без Go/Bun; ADR 0001/0002 отложены; новый план P0–P7 | только документы | P1 быстрый CI (нужно «да» на пуш) |
| 2026-11-05 | Claude Opus 5.5 | Ревью плана (`09-review-2026-11-05.md`), правки расхождений в 01–06 (Turborepo, RAM, порт 3060 занят Daiyn, G0 без S3); M0.5 доведён и закоммичен | `tsc` 0, `vitest` 4023 passed / 136 skipped, `next build` зелёный | G0 — решение владельца; без него — M0.6 |

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
