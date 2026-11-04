# HANDOFF — передача смены

> Прочитай этот файл целиком, затем [PROGRESS.md](PROGRESS.md). Этого достаточно, чтобы продолжить
> без истории чата.

## 1. Где мы

- Репозиторий: `/Users/sanjuniperodee/MyBook`
- Ветка: `refactor/microservices` (от `master` `896a123f`)
- Код приложения не менялся; изменены только docs/script.
- Прод не трогали.
- Baseline: `tsc` 0, `vitest` 4010 passed / 135 skipped / 0 failed.

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
3. **Не начинать волну 1** до гейта G0 (подтверждение target A, RAM, S3, деплой).
4. **Не добавлять** Kafka, RabbitMQ, Elasticsearch, Kubernetes, GraphQL, gRPC, Keycloak без ADR.
5. **Не делать `git add .`** — только именованные файлы. Не трогать чужие untracked-папки
   (`.agents/`, `.claude/`, `.idea/`, `Users/`, `promo/`, `reports/`, `research_notes/`, `zz-v.mjs`).
6. **Секреты** — только в `.env`/GitHub Secrets; в docs и логах — имена, не значения.
7. **Одна волна — одна ветка, маленькие PR.** Не смешивать перенос файлов и изменение логики.

## 4. Проверить окружение

```sh
cd /Users/sanjuniperodee/MyBook
git status --short
git branch --show-current          # refactor/microservices
npx tsc --noEmit                   # 0
npm test                           # 4010 passed / 135 skipped
node scripts/microservices/inventory.mjs --out docs/microservices/baseline
```

Для визуальных тестов нужны:

```sh
brew install poppler
npx playwright install chromium
export CHROMIUM_PATH="$(ls -d ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell | tail -1)"
bash scripts/visual/check.sh HEAD --quick
```

Если Chromium/poppler не установлены — visual вернёт код 2; это не провал кода, но M0.3 требует
рабочего стенда.

## 5. Следующая задача: M0.3 — визуальный стенд

**Цель:** 0 визуальных диффов на неизменённом коде; падение при любом изменении CSS/разметки.

Шаги:

1. Добавить `playwright.config.ts`:
   - `testDir: "tests/visual"`, `snapshotDir: "tests/visual/screenshots"`;
   - projects: desktop chromium 1440×900, mobile 390×844;
   - `expect.toHaveScreenshot.maxDiffPixelRatio: 0`;
   - `webServer`: `npm run dev` (или `next start` после build), `reuseExistingServer: true`;
   - `use.storageState` для админа/клиента (два проекта или два файла состояния).
2. Seed-скрипт `scripts/visual/seed.ts`:
   - отдельная тестовая БД (`TEST_DATABASE_URL`), фиксированные UUID и даты;
   - клиент с книгой/заказом, сотрудник с правами, сделка, чат, отзыв;
   - никаких реальных PII/писем/платежей.
3. `tests/visual/pages.spec.ts`:
   - клиент: `/`, `/kk`, `/login`, `/kniga/mame`, `/books/[id]/questions`, `/books/[id]/cover`,
     `/books/[id]/checkout`, `/gift`;
   - админ: `/admin`, `/admin/deals/[id]`, `/admin/clients/[id]`, `/admin/chats`, `/admin/orders`,
     `/admin/production`, `/admin/settings`;
   - маски: время, относительные даты, счётчики, аватары, QR, случайные обложки;
   - отключить анимации (`prefers-reduced-motion`, CSS injection).
4. Снять эталоны: `npx playwright test tests/visual --update-snapshots` на неизменённом коде.
5. Проверить, что эталоны детерминированы: прогнать дважды, 0 diff.
6. Добавить CI job (M0.6) с Postgres и seed.
7. Обновить PROGRESS: M0.3 `done`, следующая M0.4.

Критерий готовности:

- `npx playwright test tests/visual` — зелёный два прогона подряд.
- Изменение, например, `padding` в `src/components/ui/button.tsx`, ломает тест.
- Эталоны не содержат PII/секретов.
- Время прогона — разумное (< 5–7 мин), иначе разбить на shards.

## 6. После M0.3

- M0.4: golden DTO + `PARITY_MODE=shadow` (см. [05-contracts-and-parity.md](05-contracts-and-parity.md)).
- M0.5: каркас монорепо **без переноса кода**.
- M0.6: CI-гейты.
- M0.7: релизный манифест/откат.
- Затем **остановиться и спросить G0**: target A? RAM? S3? деплой?

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
| Визуальная сверка | `scripts/visual/check.sh`, `scripts/visual/compare.ts` |
| Деплой | `deploy/deploy.sh`, `deploy/ecosystem.config.cjs`, `deploy/nginx-mybook.conf` |
| CI | `.github/workflows/deploy.yml` |

## 8. Copy-paste промпт для следующего агента

```text
Ты продолжаешь рефакторинг MyBooks (ветка refactor/microservices) по плану
docs/microservices. Сначала прочитай docs/microservices/HANDOFF.md и PROGRESS.md,
затем docs/microservices/02-target-architecture.md и 03-migration-plan.md.

Сейчас волна 0, задача M0.3: Playwright-скриншоты админки и кабинета.
Код приложения не меняй. Прод не выкатывай. Не начинай волну 1 без гейта G0.

Сделай:
1. playwright.config.ts, seed-скрипт, tests/visual/pages.spec.ts;
2. эталоны на неизменённом коде, два прогона без diff;
3. проверку, что изменение CSS ломает тест;
4. обнови PROGRESS.md (M0.3 done, следующая M0.4);
5. покажи, какие маршруты покрыты и какие маски использованы.

Ограничения: не трогай чужие untracked-папки, не делай git add ., секреты не коммить.
```

## 9. Если что-то пошло не так

- **Тесты падают на baseline** — не начинай перенос; зафиксируй в PROGRESS, покажи ошибку.
- **Visual не снимается** — проверь poppler/Chromium, `CHROMIUM_PATH`, права; не «обновляй» эталоны
  вслепую.
- **Не хватает памяти/диска** — остановись, не запускай тяжёлые сборки параллельно.
- **Прод лежит** — только по инструкции `deploy` skill: rollback, логи, не менять nginx/БД без просьбы.
- **Сомневаешься в архитектуре** — предложи ADR, не меняй молча.
