# 06. Эксплуатация: локально, деплой, миграции, наблюдаемость

> Правило: любые команды, меняющие прод, выполняются только по явной просьбе пользователя.
> Этот документ — для подготовки и для дежурного агента.

## 1. Локальный стенд

### 1.1. Сейчас

```sh
cp .env.example .env      # DATABASE_URL, ADMIN_EMAILS, APP_SECRET
npm install
npm run dev               # http://localhost:3000
npm run create-admin -- admin@example.com 'пароль'
```

Нужны: Node 22, PostgreSQL 14+, `pdftoppm` (poppler) для PDF-тестов, Chromium headless shell для
визуальных снимков.

### 1.2. После волны 1

```sh
npm install
cp .env.example .env
docker compose -f infra/compose/dev.yml up -d   # postgres, redis, nats, minio, mailpit
npm run dev                                      # web:3000 + api:3050 (concurrently)
```

Порты:

| Компонент | Порт |
|---|---:|
| web | 3000 |
| api | 3050 |
| publishing | 3065 (3060/3061 на проде заняты Daiyn) |
| conversations | 3070 |
| platform | 3080 |
| ai | 3090 |
| Postgres | 5432 |
| Redis | 6379 |
| NATS | 4222 / monitor 8222 |
| MinIO | 9000 / console 9001 |
| Mailpit | 8025 |

`npm run dev` поднимает web + api + зависимости; `npm run dev:all` — все сервисы (после волны 2).

### 1.3. Визуальные тесты страниц

```sh
createdb mybook_visual
DATABASE_URL=postgres://…/mybook_visual npx tsx --import ./scripts/preload.mjs scripts/migrate.ts
npx playwright install chromium
VISUAL_DATABASE_URL=postgres://…/mybook_visual npx playwright test
```

Стенд сам собирает production-сборку и поднимает её на 3210; 40 эталонов (20 страниц × desktop/mobile).
Обновление эталонов — только после согласованного изменения вида. Подробно — `tests/visual/pages.README.md`.

### 1.4. Тестовая БД

- Отдельная база `mybook_test`; миграции — `npm run db:migrate`.
- S3: внешний Yandex Object Storage; локальные ключи — `~/.aws/credentials` (профиль `yc-storage`)
  и `S3_*` в `.env.local` (оба `chmod 600`, в git не попадают). Проверка — [07-storage-s3.md](07-storage-s3.md).
- Seed для визуальных тестов: `npm run seed:visual` (фиксированные UUID/даты).
- Интеграционные тесты: `INTEGRATION=1 npm run test:integration` (Postgres; Redis — `REDIS_TEST_URL`).
- Не использовать прод-базу для тестов; не коммитить дампы с PII.

## 2. Деплой

### 2.1. Сейчас

- Push в `master` → GitHub Actions: типы, линтер, тесты, сборка, артефакт.
- `deploy/ci-run.sh` → `deploy/deploy.sh --artifact`.
- Релиз: `~/mybook-releases/releases/<время>-<sha>`, симлинк `current`.
- Smoke на 3041 → переключение → перезапуск PM2 → проверка → откат при ошибке.
- nginx: `deploy/nginx-mybook.conf`, upstream 3040 + backup 3041.

### 2.2. После волны 1

Два процесса в одном артефакте:

```
release/
  web/ (standalone + static + public)
  api/ (standalone + drizzle + assets)
  manifest.json
```

PM2:

| Процесс | Порт | Память |
|---|---:|---:|
| `mybook-web` | 3040 | 700M |
| `mybook-api` | 3050 | 1000M |

Порядок выкатки:

1. Бэкап БД (`pg_dump`).
2. Миграции api (expand, обратно совместимые).
3. api на 3051 → `/api/health` → smoke.
4. web на 3041 → `/`, `/kk`, `/login` → smoke.
5. Переключение nginx/PM2.
6. Проверка снаружи (health, главная, вход, один заказ).
7. Наблюдение 15–30 мин; откат при 5xx/ошибках.

Откат:

- `bash deploy/rollback.sh` для web; для api — предыдущий релиз.
- Миграции не откатываются; схема должна быть совместима с предыдущей версией (expand/contract).
- Флаг `BACKEND_MODE=inprocess` — быстрый возврат, если api недоступен.

### 2.3. После волн 2–5

- Каждый сервис — отдельный релиз/артефакт, но выкатка — одним манифестом (версии совместимы).
- nginx маршрутизирует по префиксам; при выкатке сервиса его маршрут временно на старую версию.
- Порядок: platform → core → publishing → conversations → ai → web.
- Rollback — по манифесту; БД — только expand/contract.

### 2.4. GitHub Actions

Джобы:

1. `typecheck` + `lint`.
2. `unit` (vitest).
3. `integration` (Postgres/Redis service containers).
4. `contract` (OpenAPI/Zod, события).
5. `visual` (Playwright, Postgres, seed).
6. `build` (matrix: web, api, services).
7. `deploy` (main branch, artifact, smoke, rollback).

Кэш: npm + Turborepo. Сборка на GitHub, не на VPS.

## 3. Миграции

- Владелец схемы — владелец миграций.
- Только expand/contract:
  1. добавить колонку/таблицу/индекс (nullable/дефолт);
  2. бэкфилл батчами;
  3. переключить код;
  4. удалить старое в следующем релизе.
- Никаких `DROP COLUMN`/`DROP TABLE` в том же релизе, где код перестал использовать.
- Долгие миграции — отдельным job, не в старте приложения (сейчас миграции на старте; для больших
  таблиц это опасно).
- Проверка: `tests/schema.test.ts` (снимок схемы) + `drizzle-kit generate` — «No schema changes».
- Бэкап перед каждой миграцией; проверка восстановления раз в месяц.
- Для переноса таблиц между схемами: `ALTER TABLE ... SET SCHEMA` (быстро, без копирования), затем
  отдельная миграция на удаление FK.

## 4. Наблюдаемость

### 4.1. Что смотреть

| Сигнал | Норма | Алерт |
|---|---|---|
| 5xx | < 0.1% | > 1% 5 мин |
| p95 страницы | < 1 с | > 2× baseline 10 мин |
| p95 API | < 300 мс | > 1 с 10 мин |
| Outbox pending | < 20 | > 100 или oldest > 5 мин |
| BullMQ failed | 0 | > 0 за 10 мин |
| PDF duration | < 90 с | > 120 с или > 5% ошибок |
| Платёж не подтверждён | < 10 мин | > 10 мин |
| Сообщение не доставлено | < 1% | > 5% |
| Память сервиса | < 80% лимита | > 90% 5 мин |
| Диск/бэкап | > 20% свободно | < 10% |

### 4.2. Дашборды

- **Заказы и деньги**: заказы/час, оплаты, конверсия, ошибки платежей, сверка.
- **Сообщения**: входящие/исходящие, очередь, ошибки каналов, время ответа.
- **PDF**: очередь, длительность, память, ошибки, размер.
- **Инфраструктура**: CPU/RAM/диск, PG connections, Redis, NATS, outbox.
- **LLM**: запросы, latency, tokens, cost, fallback, ошибки.

### 4.3. Логи и трейсы

- `requestId`/`traceId` во всех логах; не логировать PII/секреты/тела платежей.
- OTel: спаны на HTTP, БД, очередь, внешние вызовы; sampling 10–20% в проде, 100% на ошибках.
- Sentry: release = commit; source maps для web.

## 5. Бэкапы и восстановление

- Postgres: ежедневный `pg_dump` + WAL-архив (если возможно); хранить 7–14 дней; проверять
  восстановление раз в месяц.
- Yandex Object Storage: versioning + lifecycle; ежедневная сверка списка объектов; выборочная
  проверка восстановления файла раз в месяц. Ключи — профиль `yc-storage`, не в git.
- `.env`/секреты: не в бэкапе БД; хранить отдельно (менеджер секретов/зашифрованный архив).
- Runbook восстановления: остановить сервисы → восстановить БД → восстановить S3 → миграции →
  запуск → smoke. Время цели — < 2 ч, точка — 24 ч.
- Перед каждой выкаткой — `pg_dump` (уже в deploy skill).

## 6. Диагностика типовых сбоев

| Симптом | Что проверить |
|---|---|
| 502 на сайте | `pm2 ls`, `pm2 logs mybook-web`, health api, nginx |
| PDF не собирается | очередь, RSS worker, `pdftoppm`, место на диске, S3 |
| Платёж не подтверждён | вебхук, подпись, `payment_invoices`, Kaspi/CloudPayments логи, сверка |
| Сообщения не уходят | Wazzup/GOWA, токен, очередь, лимиты, блокировка |
| Outbox растёт | подписчик падает, смотри `last_error`, DLQ |
| Медленные страницы | p95, запросы к БД, N+1, кэш, память |
| Ошибки после деплоя | откат по флагу/релизу, логи, миграции |
| Дубли заказов/сообщений | идемпотентность, повтор вебхука, outbox |

## 7. Секреты

- `.env` на сервере — `chmod 600`, не в git.
- GitHub Secrets — только для CI/deploy.
- `APP_SECRET` шифрует интеграции; смена требует повторного ввода ключей.
- Не логировать: пароли, токены, cookie, полные номера карт, тела платежей.
- При утечке: ротация ключа → перевыпуск токенов → проверка логов.

## 8. Релизный чек-лист

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test` — зелёные.
- [ ] `INTEGRATION=1` на тестовой БД — зелёные.
- [ ] Playwright/visual — 0 диффов.
- [ ] PDF/HTML — 0 диффов (если publishing).
- [ ] Бэкап БД сделан.
- [ ] Миграции expand/contract; откат возможен.
- [ ] Флаг/канарейка включены.
- [ ] Дашборды/алерты видят новый сервис.
- [ ] Smoke на временном порту.
- [ ] План отката записан в PROGRESS.
- [ ] Пользователь дал явное «да» на прод.
