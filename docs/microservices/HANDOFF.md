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
- **S3:** выбран Yandex Object Storage (бакет `mybooks`), профиль `yc-storage` и `S3_*` в `.env.local`
  настроены, ключи вне git. Проверка доступа вернула `403 SignatureDoesNotMatch` — ключи нужно
  перепроверить/перевыпустить. До этого publishing/медиа на S3 не переключать. См. `07-storage-s3.md`.

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

Старая PDF/HTML-сверка книги (не путать):

```sh
brew install poppler
bash scripts/visual/check.sh HEAD --quick
```

## 5. Следующая задача: M0.4 — golden DTO + parity

**Цель:** зафиксировать форму данных, которую сегодня получают страницы, и подготовить сравнение
`in-process` vs `HTTP`, чтобы волна 1 не пронесла дрейф DTO.

Две части; вторую можно сделать скелетом до появления HTTP-бэкенда.

### 5.1. Golden DTO (сделать сейчас)

1. Выбери 5–7 read-моделей, которые чаще всего используются страницами:
   `reporting.dashboard`, `reporting.dealCard`, `reporting.clientCard`, `reporting.lists`,
   `authoring.queries.bookForEditor`, `ordering.queries.orderDetails`, `messaging.view.chat`.
2. Добавь `scripts/microservices/golden.ts`:
   - работает на тестовой БД из `scripts/visual/seed.ts` (те же фиксированные ID/даты);
   - вызывает `container()` напрямую, как страница;
   - нормализует `Date` → ISO, сортирует массивы по ID, убирает `requestId`/`now`;
   - пишет `tests/microservices/golden/<path>.json`.
3. Добавь `tests/microservices/golden.test.ts` (или скрипт `--check`), который перегенерирует
   ответы и сравнивает с коммитнутыми снимками. Падение — изменение DTO.
4. Не коммить реальные PII/секреты: только seed-данные.

### 5.2. Parity-скелет (можно без HTTP)

1. Добавь `src/server/parity.ts` (или `packages/...` позже):
   - интерфейс `ParityTransport { call(path, args): Promise<unknown> }`;
   - `InProcessTransport` (реальный container) и `HttpTransport` (заглушка `throw new Error("wave 1")`);
   - `compare(path, inprocess, remote)` с нормализацией из 5.1 и отчётом `{path, field, inprocess, remote}`.
2. Флаг `PARITY_MODE=off|shadow|strict`:
   - `off` — ничего;
   - `shadow` — вызвать оба, расхождения в лог, пользователю отдать in-process;
   - `strict` — расхождение = ошибка (только тесты/staging).
3. Тест: на неизменённом коде `shadow` даёт 0 расхождений (оба транспорта — in-process).
4. Не включать в прод до волны 1.

### Критерий готовности

- `npx tsc --noEmit` и `npm test` зелёные.
- Golden-снимки воспроизводятся на чистом seed; изменение поля в DTO ломает тест.
- Parity-скелет компилируется и на `shadow` не меняет ответы.
- PROGRESS обновлён: M0.4 `done`, следующая M0.5.

## 6. После M0.4

- M0.5: каркас монорепо **без переноса кода**.
- M0.6: CI-гейты (включая визуальный job с Postgres; эталоны для Linux-раннера снять отдельно).
- M0.7: релизный манифест/откат.
- Затем **остановиться и спросить G0**: target A? RAM? деплой? Доступ к S3 — проверить отдельно.

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
| Деплой | `deploy/deploy.sh`, `deploy/ecosystem.config.cjs`, `deploy/nginx-mybook.conf` |
| CI | `.github/workflows/deploy.yml` |

## 8. Copy-paste промпт для следующего агента

```text
Ты продолжаешь рефакторинг MyBooks (ветка refactor/microservices) по плану
docs/microservices. Сначала прочитай docs/microservices/HANDOFF.md и PROGRESS.md,
затем docs/microservices/02-target-architecture.md и 03-migration-plan.md.

Сейчас волна 0, задача M0.4: golden DTO и parity-скелет.
Код приложения не меняй (кроме тестовой обвязки). Прод не выкатывай.
Не начинай волну 1 без гейта G0.

Сделай:
1. scripts/microservices/golden.ts + golden-снимки 5–7 read-моделей на seed;
2. тест/скрипт проверки golden;
3. src/server/parity.ts с off/shadow/strict и двумя транспортами (HTTP — заглушка);
4. тест, что на неизменённом коде shadow даёт 0 расхождений;
5. обнови PROGRESS.md (M0.4 done, следующая M0.5).

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
