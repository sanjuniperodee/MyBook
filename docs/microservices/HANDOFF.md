# HANDOFF — передача смены

> Прочитай этот файл целиком, затем [PROGRESS.md](PROGRESS.md). Этого достаточно, чтобы продолжить
> без истории чата.

## 1. Где мы

- Репозиторий: `/Users/sanjuniperodee/MyBook`
- Ветка: `refactor/microservices` (от `master` `896a123f`)
- Прод не трогали. UI и бизнес-логика не менялись; добавлена только тестовая обвязка
  (`src/instrumentation-node.ts` — фиксация часов под `VISUAL_NOW`).
- Baseline: `tsc` 0, `vitest` 4010 passed / 135 skipped / 0 failed.
- **M0.3 готов:** 40 визуальных эталонов (20 страниц × desktop/mobile), два прогона подряд 40/40.
  Подробно — `tests/visual/pages.README.md`.
- **M0.5 готов:** npm workspaces + заготовки пакетов, `08-monorepo.md`; `next build` зелёный.
- **Ревью плана:** `09-review-2026-11-05.md` — вопросы к G0.
- **M0.4 готов:** 8 golden DTO (`tests/microservices/golden/`), parity-скелет `src/server/parity.ts`,
  14 тестов; `golden:check` — 0 mismatch дважды.
- **S3:** выбран Yandex Object Storage (бакет `mybooks`), профиль `yc-storage` и `S3_*` в `.env.local`
  настроены, ключи вне git. Проверка доступа вернула `403 SignatureDoesNotMatch` — ключи нужно
  перепроверить/перевыпустить; новые ключи, AWS CLI и AWS SDK v3 с `forcePathStyle: true` дают тот же
  `SignatureDoesNotMatch`. До этого publishing/медиа на S3 не переключать. См. `07-storage-s3.md`.

## 2. Что уже решено

- Цель — не 15 микросервисов, а **6 деплойментов + edge** сейчас, 8 — при необходимости.
- Сначала **выносим бэкенд целиком** (`web` + `api`), потом режем по доменам.
- `core` (ordering+sales+clients+automation+feedback+reporting) не делим до волны 6.
- Данные: схема на сервис в одной БД, потом физическое разделение.
- Инфраструктура: Redis, NATS JetStream, BullMQ, S3/MinIO, OTel. Без Kafka/ES/K8s/Keycloak.
- Фронт не меняем: визуальный контракт + golden DTO + shadow.

Подробно: [README.md](README.md), [02-target-architecture.md](02-target-architecture.md),
[03-migration-plan.md](03-migration-plan.md), [adr/](adr/).

## 3. Жёсткие ограничения

1. **Не менять UI** (`src/app`, `src/components`, тексты, CSS, URL) без явного согласования.
2. **Не выкатывать в прод** без явного «да» пользователя. Ветка/PR/локальные проверки — можно.
3. **Не начинать волну 1** до гейта G0 (подтверждение target A, RAM, деплой; S3-доступ — отдельный блокер).
4. **Не добавлять** Kafka, RabbitMQ, Elasticsearch, Kubernetes, GraphQL, gRPC, Keycloak без ADR.
5. **Не коммитить ключи S3.** Они лежат в `~/.aws/credentials` и `.env.local` (`chmod 600`, в git не
   попадают). В docs — только имена переменных. Если ключ засветился — перевыпустить.
6. **Не делать `git add .`** — только именованные файлы. Не трогать чужие untracked-папки
   (`.agents/`, `.claude/`, `.idea/`, `Users/`, `promo/`, `reports/`, `research_notes/`, `zz-v.mjs`).
7. **Секреты** — только в `.env`/GitHub Secrets; в docs и логах — имена, не значения.
8. **Одна волна — одна ветка, маленькие PR.** Не смешивать перенос файлов и изменение логики.

## 4. Проверить окружение

```sh
cd /Users/sanjuniperodee/MyBook
git status --short
git branch --show-current          # refactor/microservices
npx tsc --noEmit                   # 0
npm test                           # 4010 passed / 135 skipped
node scripts/microservices/inventory.mjs --out docs/microservices/baseline
```

Визуальные тесты страниц (отдельная БД, не прод):

```sh
createdb mybook_visual   # один раз
DATABASE_URL=postgres://…/mybook_visual npx tsx --import ./scripts/preload.mjs scripts/migrate.ts
npx playwright install chromium
VISUAL_DATABASE_URL=postgres://…/mybook_visual npx playwright test
```

Стенд сам собирает production-сборку и поднимает её на 3210; первый прогон ~3 мин, повторный ~2.
Подробно — `tests/visual/pages.README.md`.

Golden DTO и parity:

```sh
VISUAL_DATABASE_URL=postgres://…/mybook_visual npm run golden:check
npx vitest run tests/microservices/parity.test.ts
```

`golden:check` сам прогоняет seed и сравнивает 8 read-моделей; parity-тесты не требуют БД.

Старая PDF/HTML-сверка книги (не путать):

```sh
brew install poppler
bash scripts/visual/check.sh HEAD --quick
```

## 5. Где мы: P0–P6 на проде, P7 копит данные

Направление — [ADR 0009](adr/0009-modular-monolith-with-workers.md): модульный монолит + процесс `mybook-worker`,
TypeScript на Node. Сделано и выкачено 2026-11-05:

- **CI** (`.github/workflows/deploy.yml`): типы, линтер, тесты в 5 частях, сборка — параллельно; выкатка ждёт всё и
  только для master; на PR — без выкатки. Новый тестовый файл сам попадает в шарды.
- **`mybook-worker`**: фон (планировщик, сверка Kaspi, outbox, бот, IMAP, звонки WhatsApp, очередь видео) — отдельный
  PM2-процесс из `worker.mjs` того же релиза. Сайт с `MYBOOK_BACKGROUND=worker` фон не запускает. Откат:
  `MYBOOK_WORKER=off pm2 start deploy/ecosystem.config.cjs --only mybook` (или релиз без `worker.mjs`).
  `deploy.sh` сам возвращает фон в сайт, если воркер не поднялся за 15 с.
- **Поток PDF** с пределом кучи 2048 МБ (`PDF_WORKER_HEAP_MB`): переполнение роняет поток, а не сайт.
- **Границы**: ESLint запрещает БД в `src/server` (кроме `container.ts`, `scheduler.ts`); дизайнер, свои видео/аудио,
  письмо о платеже — в модулях. Карта модулей — `docs/modules.md` (генерируется, тест свежести).
- **Замер**: `docs/microservices/perf.md`; лог таймингов nginx `/var/log/nginx/mybook-timing.log`.

Daiyn на сервере остановлен по просьбе владельца (PM2 `daiyn` удалён; файлы на месте).

## 6. Дальше

- Неделя наблюдения: `pm2 logs mybook-worker`, сверка Kaspi/бот/почта идут; `pm2 jlist` — память воркера.
- После недели: `ssh … 'sudo cat /var/log/nginx/mybook-timing.log' | node scripts/perf/route-latency.mjs` → таблица в
  perf.md → оптимизировать только то, что медленно по цифрам.
- Находка из perf.md: двойной адрес upstream `localhost:3040` (шум в error.log) — отдельной задачей.
- Пересмотр ADR 0009 — только по его триггерам (§5).

## 7. Карта важных файлов

| Что | Где |
|---|---|
| Архитектура монолита | `docs/architecture.md` |
| Старый план рефакторинга | `docs/refactor/plan.md`, `docs/refactor/report.md` |
| ADR по очередям | `docs/adr/0001-messaging-queues-cache.md` |
| Точка композиции | `src/server/container.ts` |
| События/подписки | `src/server/subscriptions.ts`, `src/shared/infrastructure/OutboxDispatcher.ts` |
| Планировщик | `src/server/scheduler.ts` |
| Схема БД | `src/shared/infrastructure/db/schema/*.ts` |
| Границы модулей | `eslint.config.mjs`, `tests/architecture.test.ts` |
| Визуальная сверка PDF/HTML | `scripts/visual/check.sh`, `scripts/visual/compare.ts` |
| Визуальные тесты страниц | `playwright.config.ts`, `tests/visual/pages.spec.ts`, `tests/visual/pages.README.md` |
| Seed для визуальных тестов | `scripts/visual/seed.ts` |
| Golden DTO | `scripts/microservices/golden.ts`, `tests/microservices/golden/` |
| Parity | `src/server/parity.ts`, `tests/microservices/parity.test.ts` |
| Деплой | `deploy/deploy.sh`, `deploy/ecosystem.config.cjs`, `deploy/nginx-mybook.conf` |
| CI | `.github/workflows/deploy.yml` |

## 8. Copy-paste промпт для следующего агента

```text
Ты продолжаешь рефакторинг MyBooks (ветка refactor/microservices) по плану
docs/microservices. Сначала прочитай docs/microservices/HANDOFF.md и PROGRESS.md,
затем docs/microservices/02-target-architecture.md и 03-migration-plan.md.

Направление — ADR 0009: модульный монолит + mybook-worker, без микросервисов и смены языка.
P0–P6 на проде; текущая задача — P7 (замеры) из PROGRESS.md. Пуш в master = выкатка на прод:
пушь только по явному «да» владельца в этой сессии. Обнови PROGRESS.md после задачи.

Ограничения: не трогай чужие untracked-папки, не делай git add ., секреты не коммить.
```

## 9. Если что-то пошло не так

- **Тесты падают на baseline** — не начинай перенос; зафиксируй в PROGRESS, покажи ошибку.
- **Visual не снимается** — проверь тестовую БД, Chromium, что не запущен старый сервер на 3210;
  не «обновляй» эталоны вслепую.
- **Visual падает на одном маршруте** — посмотри `tests/visual/.artifacts/.../test-failed-1.png` и
  `error-context.md`; сначала пойми, это регрессия UI или нестабильность теста.
- **Не хватает памяти/диска** — остановись, не запускай тяжёлые сборки параллельно.
- **Прод лежит** — только по инструкции `deploy` skill: rollback, логи, не менять nginx/БД без просьбы.
- **Сомневаешься в архитектуре** — предложи ADR, не меняй молча.
