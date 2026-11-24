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

### 2.5. mybook-files (Go, пилот G3, ADR 0011)

Процесс PM2 `mybook-files` (`bin/mybook-files` из релиза, `services/files`) слушает `127.0.0.1:3050` и отдаёт файлы
хранилища по подписанной ссылке сайта. Трафик на него — режим сайта, без выкатки и без перезапуска:

```sh
mkdir -p ~/mybook-flags
echo proxy    > ~/mybook-flags/files-service   # сайт проверяет права и передаёт поток от сервиса (без лишнего запроса браузера)
echo redirect > ~/mybook-flags/files-service   # 302 на /files/<ссылка>; next.config.ts переписывает /files/* на сервис
echo off      > ~/mybook-flags/files-service   # откат: сайт отдаёт сам (читается раз в 10 с)
```

Сервис не отвечает (`pm2 stop mybook-files`, упал) — сайт сам отдаёт файлы старым путём (проверка `/healthz` раз в 10 с).
Сверка со старым путём перед включением: `scripts/files/parity.ts` (как запускать — в шапке файла), условие — 0 расхождений.

**nginx — включено 24.11.** В `server` сайта (`/etc/nginx/sites-available/mybooks-kz`) перед `location /` стоит блок,
байты `/files/` идут из nginx сразу в Go, мимо Next:

```nginx
location ^~ /files/ {
    proxy_pass http://127.0.0.1:3050;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
}
```

Режим сейчас — `redirect`. Маршруты со своим ETag (фото) и в `redirect` идут как `proxy`: 302 браузер не кэширует, и
фото стало бы двумя запросами вместо одного 304.

**Откат.** Быстрый, без sudo: `echo proxy > ~/mybook-flags/files-service` (или `off`) — сайт перестаёт выдавать ссылки
`/files/` за ≤ 10 с, блок nginx остаётся, но не используется. Полный (нужен sudo, вход `ubuntu@` с ключом администратора):

```sh
sudo cp /etc/nginx/backup-2026-11-24/mybooks-kz /etc/nginx/sites-available/mybooks-kz
sudo nginx -t && sudo systemctl reload nginx
```

На сервере же ILM HUB и my-test — их конфиги не трогать. `/_next/static` с диска nginx не отдаёт: `/home/srv` закрыт
(700) для `www-data`, открывать домашнюю папку ради этого не стали.

### 2.6. Cloudflare перед сайтом (24.11)

Зачем: статика (`/_next/static`, картинки сайта) — из ближайшей точки Cloudflare, защита от DDoS. Страницы, API и данные
остаются на нашем сервере в Казахстане: Cloudflare их не кэширует (у страниц и файлов `Cache-Control: private`/`no-store`).

На сервере (сделано 24.11): `snippets/mybook-cloudflare-realip.conf` (копия — `deploy/nginx-cloudflare-realip.conf`)
подключён в `server` mybooks.kz — `$remote_addr` и `X-Real-IP` берутся из `CF-Connecting-IP`, но только от адресов
Cloudflare; без Cloudflare ничего не меняет. Это нужно лимитам частоты и списку разрешённых IP (`src/server/rateLimit.ts`).
Диапазоны меняются редко — сверять с https://www.cloudflare.com/ips-v4 и ips-v6. Откат — копия
`/etc/nginx/backup-2026-11-24-cf/mybooks-kz`, `nginx -t`, `systemctl reload nginx`.

В Cloudflare (Free):
- DNS: `mybooks.kz` A 185.102.75.191 и `www` — **Proxied**; `mail` (A 94.131.93.92), MX, SPF/DKIM/TXT — **DNS only**
  (почта через Cloudflare не ходит); перенести все записи из панели ps.kz.
- SSL/TLS: **Full (strict)** (на сервере сертификат Let's Encrypt; продление HTTP-01 идёт через Cloudflare на порт 80).
  «Always Use HTTPS» не нужен — nginx сам переводит на https.
- Выключить: **Rocket Loader**, **Email Address Obfuscation** (ломают гидратацию React), **Bot Fight Mode** (режет
  CloudPayments `/api/payments/cloudpayments/*` и приложение `/api/mobile/*`).
- Security → WAF → Custom rule «Skip» (все проверки) для `starts_with(http.request.uri.path, "/api/payments/")` или
  `"/api/mobile/"`.
- Caching → Cache Rules: **Bypass** для путей `/files/`, `/api/v/` (свои видео по QR — Cloudflare не для видео),
  `/wa-call/`. Остальное — по заголовкам сайта.
- Network: WebSockets — вкл. (звонки WhatsApp `/wa-call/*`); тело запроса до 100 МБ (у nginx 80 МБ); ответ должен
  начаться за 100 с, иначе 524 (SSE `/api/admin/live/stream` шлёт ping каждые 25 с; сборка PDF — ~25 с).
- Последний шаг — у регистратора (ps.kz) сменить NS `ns1–3.ps.kz` на два NS Cloudflare. Откат — вернуть NS ps.kz.

**Итог 24.11: откатили.** Зону включили (NS kira/zac.ns.cloudflare.com, 12:41 Алматы), но из Казахстана бесплатный
Cloudflare вёл трафик через Варшаву (`/cdn-cgi/trace`: `colo=WAW`, `loc=KZ`): ping 105 мс вместо 13, ответ API
0,56–0,61 с вместо 0,03 с, главная 1,3 с. Через ~1 ч NS вернули на ps.kz (зона ps.kz не менялась). Зона в Cloudflare
оставлена: резолверы, успевшие взять NS Cloudflare, ещё до суток ходят через неё. Пробовать снова — только с точкой
в Казахстане (платный план/Argo или другой CDN с узлом в Алматы), сначала замер `colo` из сетей Kcell/Beeline/Казахтелеком.
nginx-сниппет адреса клиента оставлен: без Cloudflare он ничего не меняет.

Проверка после переключения: `curl -sI https://mybooks.kz/ | grep -i cf-ray` (код точки в конце), вход в CRM, чаты
(живая лента), звонок, оплата CloudPayments, загрузка видео, приложение, в журнале nginx — настоящие адреса клиентов.

### 2.7. Память и скорость: переключатели (24.11)

- Процесс вёрстки PDF живёт после сборки `PDF_WORKER_IDLE_MIN` минут (по умолчанию 2; было 10) — в `.env`.
- Пул БД: `DATABASE_POOL_SIZE` (сайт 10 по умолчанию), воркер — `MYBOOK_WORKER_POOL` в окружении PM2 (12). Пик занятых
  и очередь — `dbPeakBusy`/`dbPeakWaiting` в `~/mybook-logs/perf-*.jsonl`; очередь > 0 часто — пул мал.
- my-test: `connection_limit=5` в `DATABASE_URL` `~/bilimland/apps/api/.env`; откат — `.env.bak-20261124-pool` и
  `pm2 restart bilimland-api --update-env`.
- Медленные запросы mybook: `auto_explain` и `log_min_duration_statement` = 150 мс (журнал Postgres
  `/var/log/postgresql/postgresql-16-main.log`); выключить — `ALTER DATABASE mybook RESET …` (perf.md, 24.11).
- `book_questions.answer_words` считает база (миграция 0105); откат кода — вернуть regexp в `bookProgress.ts`, столбец
  не мешает. **Новые миграции:** `when` в журнале — время генерации; не править вручную на будущее (тест в schema.test.ts).

### 2.8. Код на сервере, разовые скрипты, своп (24.11)

Сборка — в GitHub Actions; на сервере для выкатки нужны `~/mybook/.env`, `deploy/*` и git (ci-run.sh делает
`git fetch` + `merge --ff-only`). `~/mybook` — неглубокий клон (`git fetch --depth=20`, только `master`; полная история —
`git fetch --unshallow`). Из `node_modules` убраны сборочные пакеты (swc Next, typescript, vite/vitest, playwright,
eslint, lightningcss, tailwind, drizzle-kit): 1,3 ГБ → 0,8 ГБ. Разовые скрипты — как раньше, из `~/mybook`:

```sh
cd ~/mybook && SCHEDULER=off PDF_WORKER=off node_modules/.bin/tsx --env-file-if-exists=.env --import ./scripts/preload.mjs scripts/<скрипт>.ts
# проверка, что запуск работает (только чтение): scripts/ops/check.ts → «ops-check ok»
```

Скрипту нужен пакет, которого нет (ошибка «Cannot find module») — `cd ~/mybook && npm ci --no-audit --no-fund`
(вернёт всё, ~1 ГБ). Ручная выкатка со сборкой на сервере (запасной путь) делает `npm ci` сама.

my-test (`~/bilimland`, работает из папки репозитория: `next start`, `dist/main.js`): убраны `apps/mobile/node_modules`
(приложение для телефона, на сервере не нужно), musl-варианты нативных пакетов (сервер на glibc) и playwright —
2,2 → 1,8 ГБ. Выкатка my-test при смене зависимостей делает `npm install` — вернёт их, это не ошибка.

jemalloc у my-test (`~/ecosystem.mytest.config.cjs`, как у MyBooks): откат — `MYTEST_JEMALLOC=off pm2 startOrReload
~/ecosystem.mytest.config.cjs --only mytest-v2 --update-env` (и `bilimland-api`), или копия `.bak-20261124-jemalloc`.

Своп: `/swapfile` 2 ГБ, `vm.swappiness=10` (`/etc/sysctl.d/90-swap.conf`, строка в `/etc/fstab`) — страховка от OOM,
в обычной работе не используется. Убрать: `sudo swapoff /swapfile`, строку из fstab, файл.

Postgres: роли `mybook` и `bilimland` — `idle_in_transaction_session_timeout = 5min` (зависшая транзакция не держит
блокировки). `idle_session_timeout` не ставили: в коде нет `pool.on("error")`, убитое простаивающее соединение уронило бы
процесс, а LISTEN живых обновлений CRM рвался бы каждые N минут; соединения пула и так закрываются через 10 с.

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
