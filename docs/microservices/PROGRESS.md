---
updated: 2026-11-26T07:55:00+05:00
branch: master
wave: G
task: API v1 (ADR 0012) — A5 (веб без БД): Разделы 1 (cabinet) и 2 (book) переведены на API v1, allowlist 275 → 226
status: in_progress
next: "A5 — выкатка и сверка Раздела 2 (WEB_USE_API_V1=cabinet,book), далее Раздел 3 (заказ и оплата) и Раздел 4 (публичные страницы)"
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

## Направление после ADR 0011 (2026-11-24)

Владелец: снизить потребление и ускорить обработку, сохранив функционал; решения — за Claude. Замеры и план —
[10-go-plan-2026-11-24.md](10-go-plan-2026-11-24.md), решение — [ADR 0011](adr/0011-go-services-strangler.md):
весь бэкенд не переписываем (экономия ~0,3 ГБ, скорость не растёт); Go — для «труб» по замерам.

| Фаза | Статус |
|---|---|
| G1. Замеры PDF, файлов, RSS процессов | `done` (`c2bd00ae`): журнал `~/mybook-logs/perf-*.jsonl` — вёрстка PDF (время, пик), память процессов и всех PM2 раз в 5 мин, счётчики маршрутов файлов и чтений S3; сводка `scripts/perf/perf-summary.mjs`; таблица маршрутов файлов — [perf.md](perf.md) |
| G2. Быстрые победы в Node (`mybook` 529 → ≤ 400 МБ) | `done` (`f0196da1`): склейка 24 одинаковых копий серверных чанков — `mybook` через 5 мин после выкатки 367 → 231 МБ (куча 253 → 118), пробный экземпляр после всех маршрутов 470 → 350 МБ, задержка та же; файлы хранилища — потоком с Range. Флаги Node проверены — не дали выигрыша без регресса, не включены. Повторить замер после суток работы |
| G3. Пилот Go `mybook-files` (отдача файлов и медиа) | `done`, **включён `redirect` + nginx** (24.11): блок `location ^~ /files/` в nginx (копия до правки — `/etc/nginx/backup-2026-11-24/`), сверка через https://mybooks.kz 588/588; маршруты отдают 302 на `/files/<ссылка>`, nginx — сразу в Go. Ссылка стабильна час (кэш браузера, 304), фото (свой ETag) остаются `proxy` (`008c9202`). На проде под нагрузкой видео (493 МБ): CPU сайта 3,4–3,8 → 0,5–0,6 с, пик RSS сайта 362–375 → 327–349 МБ, TTFB p95 55–57 → 20–53 мс. Откат — `echo proxy\|off > ~/mybook-flags/files-service` |
| G4. Go-воркер очередей | `canceled` по гейту (24.11): пустой воркер без базы и заданий — 161–163 МБ RSS из 186–194 на проде, т. е. вся работа (доставка в том числе) — 20–27 МБ < 50; доставка outbox — это ~60 доменных подписчиков в TS, вынос в Go память не снимет. Вместо этого ужат TS-воркер: бандл без пробелов/комментариев и чистый ASCII (`scripts/ascii-bundle.mjs`) — пустой воркер 161–163 → 142–149 МБ, куча 71,6 → 50,3 МБ; то же для `pdf-worker.mjs` |
| Память и скорость после G4 (24.11) | `done` частично — [perf.md](perf.md) «память сервера и скорость CRM»: процесс PDF закрывается через 2 мин; слова ответов в базе (`answer_words`, 0105) — прогресс книг CRM 550 → 18 мс; картинки `public/` кэшируются неделю; пул my-test 9 → 5; `auto_explain` > 150 мс. Откачено по замеру: `preloadEntriesOnStart: false`, пул сайта 6. Не делали: systemd, kaspi-pos на Go, флаги V8 (причины в perf.md). Сбой миграции 0106 07:39–07:40 — исправлен (`d841be5b`) |
| Диск и память под 1 ядро / 2 ГБ (24.11) | `done`: jemalloc у my-test (сайт 333 → ~171, API 194 → ~162 МБ); `~/mybook` 1,3 → 0,8 ГБ, `~/bilimland` 2,2 → 1,8 ГБ; своп 2 ГБ; idle-in-transaction 5 мин. Не делали по замеру: Turbopack у my-test (выигрыша нет), Prisma 6, общий GOWA, systemd — [perf.md](perf.md) |
| G5. Бэкенд-API на Go | только по триггерам ADR 0009 §5 |

### План G4 (Go-воркер доставки) — до начала работы (итог: не начат, гейт не пройден — строка G4 выше)

Что выносится — только «труба» доставки, домен остаётся в TS:

1. **Сначала замер** (без кода): что в 180–190 МБ `mybook-worker` относится к доставке. Снимок кучи пробного воркера
   (`scripts/perf/probe`, `SCHEDULER=off`, без отправок) и по журналу `kind: mem/pm2` за неделю. Воркер — один esbuild-бандл
   (дублей чанков, как у сайта, нет): куча ~75–90 МБ — код всех модулей и пул БД. Если доставка (outbox → письма SMTP,
   WhatsApp через GOWA, вебхуки, ретраи) — меньше 50 МБ из них, **G4 не начинаем** (гейт плана §4) и записываем почему.
2. Если ≥ 50 МБ: `services/delivery` — забор готовых заданий из Postgres (`FOR UPDATE SKIP LOCKED`, те же advisory-
   блокировки), отправка, ретраи с теми же интервалами, запись результата. Правила, бот, расписание и решение «что
   отправить» остаются в TS-воркере и кладут готовые задания в таблицу. Без новых хранилищ и брокеров (ADR 0011 §4).
3. Паритет: теневой режим — Go забирает задания с флагом `dry_run`, сверка с тем, что отправил TS (получатель, тело,
   вложения, идемпотентный ключ), неделя без расхождений; переключение флагом, откат — флагом.
4. Гейт: `mybook-worker` 184 → ≤ 120 МБ, задержка доставки не хуже; иначе откат и запись в perf.md.

## API v1: web / api / mobile (ADR 0012, решение владельца 24.11)

[ADR 0012](adr/0012-web-api-mobile.md): контракт первым (`packages/contracts`), процесс `mybook-api` (`apps/api`),
веб — душителем за флагами, мобильное приложение — только через v1. G0 закрыт (M0.1–M0.7 + подтверждение владельца).

| ID | Задача | Статус | Результат / откат |
|---|---|---|---|
| A1 | Контракт v1, OpenAPI, TS- и Dart-клиенты, процесс api, вход (клиент и сотрудник, 2FA, Bearer/cookie), книги: список, редактор, автосохранение | `done` | `tests/api-v1.test.ts`: генерация актуальна, маршрут ↔ обработчик, лимиты = сайт; маршрут сайта автосохранения проверяет тело схемой контракта |
| A2 | Выкатка: PM2 `mybook-api` (:3044), nginx `/api/v1/`, замер памяти | `done` 24.11 | https://mybooks.kz/api/v1/health 200, без входа 401; RSS 140 / PSS 88 МБ; откат — `MYBOOK_API=off` при выкатке, nginx — `/etc/nginx/backup-2026-11-24-api/mybooks-kz` |
| A3 | Клиентская часть | `done` 25.11 | моё: виды книг, создание, редактор, автосохранение, фото и нативный редактор фото (`photo-editor.ts`), голос → текст, свои видео и аудио по QR (`answer-files.ts`, 11 маршрутов), письма близких, предпросмотр, отзывы (домен: ReviewsService.setPhoto), обложка (шаблоны и нативный конструктор слоёв `cover.ts` `coverDesign*`, `COVER_DESIGN_LIMITS` в `@mybook/contracts/limits`), полка, штаб книги, помощник, заказ и оплата нативно (`cabinet*.ts`, `server/checkout.ts`, `order-view.ts`, `kaspi-view.ts`) |
| A4 | CRM в v1: чаты, сделки, заказы, оплаты, задачи, клиенты, обращения, финансы, настройки; `/api/mobile/*` → v1 | `done` 25.11 | перенесены все JSON-маршруты `/api/mobile/*`: списки и карточки (`crm-lists.ts`), правка/деньги/обращения/финансы/аналитика/настройки/каталог/админка, КП (`crm-kp.ts`), роли и 2FA (`crm-security.ts`), ходы бота (`crmChatBotTraces`), счета (`crm-invoices.ts`), push CRM (`crmPushConfig`/`crmDevicePut`/`crmDeviceDelete`), и оставшиеся операции (`crm-mobile-rest.ts`). В приложении CRM экраны и сторы переведены на API v1 с ETag/304 и `LocalCache`, плюс нативно сделаны «Почему так?» бота, КП, роли и 2FA. Старые `/api/mobile/*` сохранены для APK 1.15.0; тесты — `tests/api-v1-a4-rest.test.ts`, `tests/api-v1-crm-bot-kp-security.test.ts` |
| A5 | Веб без БД: разделы на API за флагом + parity; тест архитектуры с сокращаемым списком исключений | `in_progress` | 25.11: в `apps/api/src/site-routes.ts` добавлены главы, вопросы, фото, письма, настройки книги, сообщения чатов и уведомления CRM (`tests/api-v1-a5-site.test.ts`); `src/server/v1-web-client.ts`, храповик `tests/web-v1-strangler.test.ts`. 26.11 — **Раздел 1 (`cabinet`, на проде `e3069cbb`, `WEB_USE_API_V1=cabinet` + `PARITY_MODE=shadow`)**: `v1-web-client.ts` (`webApiOnly`, `v1WebAction`, `Cookie`+`Bearer`+`x-real-ip`), `v1-local-bridge.ts`, 10 маршрутов `web-cabinet.ts`, `auth.ts`, `shelf.ts` и 10 файлов Раздела 1 (`web-v1-strangler` 275 → 266, `architecture-web-db` 173 → 166). 26.11 — **Раздел 2 (`book`: страницы редактора + 38 API-роутов книги и потоковых медиа)**: 9 маршрутов `web-book-pages.ts` + ленивый `v1-local-bridge-book.ts` + перевод `books.ts`, `book-hub.ts` и 9 страниц `(app)/books/[id]/**` (`tests/api-v1-web-book-pages.test.ts`); потоковый `src/server/v1-proxy.ts` + `/api/v1/site/*` в `mybook-api` + вынос 38 обработчиков в `src/server/site-handlers/{books,media}/*` (`tests/api-v1-web-book-proxy.test.ts`); allowlist сокращён: `web-v1-strangler` **266 → 226**, `architecture-web-db` **166 → 157**. 26.11 — **Раздел 3 (`orders`: оформление, заказы, оплата по ссылке)**: 8 маршрутов `web-orders.ts` (контракт `packages/contracts/src/v1/web-orders.ts`), ленивый `v1-local-bridge-orders.ts`, страницы `checkout`, `orders`, `orders/[id]`, `pay/[token]` и их действия; Kaspi-счета, вебхуки Kaspi/CloudPayments (заголовки подписи пробрасываются), файлы и прогресс сборки заказа — через `v1SiteProxy` (`src/server/site-handlers/{orders,payments}/*`); правила цены вынесены без изменений в `src/shared/domain/pricing.ts` (`tests/api-v1-web-orders.test.ts`). На проде флаг `orders` **не включён**: веб считает заказы как раньше, до сверки `PARITY_MODE=shadow`. Allowlist: `web-v1-strangler` **226 → 211**, `architecture-web-db` **157 → 148**. 26.11 — **Раздел 4 (`public`: публичные страницы)**: 12 маршрутов `web-public.ts` (контракт `packages/contracts/src/v1/web-public.ts`), ленивый `v1-local-bridge-public.ts`; страницы сертификата, активации кода, письма близких по ссылке, отзыва по ссылке, отписки, `/love`, подвал (`src/server/site-chrome.ts`), витрина отзывов главной и тем (`siteReviews`), баннер приглашения (`invitedBy`); на сайте без БД цены и переключатели берёт `ensureCatalog` из `webSiteCatalog` (раз в 10 с, на нашем сервере — как раньше). 10 API-маршрутов (PDF сертификата, письма, отзывы и фото отзыва, чат сайта и «Перезвоните», iCal, аватары чатов, `/r/<код>`, `/go/<ссылка>`) — через `v1SiteProxy` в `src/server/site-handlers/public/*`; чат ставит cookie посетителя в самом ответе, `/r` читает cookie из заголовка, прокси передаёт `x-mb-locale`. Чистые константы (`widgetCode`, `isValidSlug`, `whatsappLink`, `MAX_PHOTOS`, `THANK_YOU`) — в `src/shared/domain`. Флаг `public` на проде **не включён** (`tests/api-v1-web-public.test.ts`). Allowlist: `web-v1-strangler` **211 → 193**, `architecture-web-db` **148 → 134**. 26.11 — **Раздел 5.1 (`crm`: основа, API-маршруты и server actions CRM)**: контракт `packages/contracts/src/v1/web-crm.ts` — `webCrmStaff` (права сотрудника и что мешает войти: `src/server/access.ts` на сайте без БД берёт их из API), `webCrmRead` (сборщики данных страниц `src/server/crm-ops/*`, права — у операции) и `webCrmAct` (server actions); значения — в обёртке `src/shared/wire.ts` (Date, Map, Set, BigInt, FormData, файлы без потерь). 35 файлов действий `src/app/admin/**` перенесены без изменений в `src/server/crm-actions/*` (свои права, zod и лимиты; `actions.mjs` проверяет их там, а обёртки `crmAction` в src/app/admin — что цель существует); через API действие выполняется в mybook-api, сайт повторяет redirect/notFound и сбрасывает кэш `/admin`. 61 API-маршрут (`/api/admin/*`, старое приложение `/api/mobile/*`, вебхуки `/api/integrations/*`, `/api/support/release`) — через `v1SiteProxy("crm")` в `src/server/site-handlers/{admin,mobile,integrations,support}`, прокси пробрасывает заголовки подписей вебхуков; `_crm-lists` → `src/server/crm-lists`. Внутри mybook-api `v1WebRead` больше не сверяет (не зовёт API сам себя). Флаг `crm` на проде **не включён** (`tests/api-v1-web-crm.test.ts`). Allowlist: `web-v1-strangler` **193 → 91**, `architecture-web-db` **134 → 96**. 26.11 — **Раздел 5.2 (`crm`: небольшие страницы)**: чистые `domain`/`ui` модулей страницам можно — тесты храповика проверяют их транзитивно (`tests/pure-imports.ts`: без БД, сервера, `application`/`infrastructure`), что и велит слой представления в eslint; сборщики `src/server/crm-ops/pages.ts` (промокоды, сертификаты, отзывы, маркетинг, команда, журнал, планы, роли, безопасность, звонки, книги, шаблоны, обращения, лимиты и дизайнер ИИ, автоматизации, производство, каталог, поиск, упаковочный лист, поля, новая сделка и клиент, этапы, дубли, доски и календарь) — права страницы и видимость по роли считаются по сотруднику из сессии; синхронизация каталога при открытии — действием, а не чтением. Allowlist: `web-v1-strangler` **91 → 27**, `architecture-web-db` **96 → 27**. 26.11 — **Раздел 5.3 (`crm`: деньги, каркас, главная, заказы)**: сборщики `money.*` (финансы, расходы, прибыль, реестр продаж, заявки: период считается на сервере из того же ввода), `shell.*` (значки и телефония каркаса, «Мой день», сводка руководителя), `orders.*` (список с числами на чипах, карточка заказа с фактами уведомления и пределом скидки); выход на смену при заходе — действие `autoShiftOnVisitAction` (до этого захода «был в CRM» берётся со страницы: сайт без БД отмечает активность раньше). Allowlist: `web-v1-strangler` **27 → 17**, `architecture-web-db` **27 → 17**. 26.11 — **Раздел 5.4 (`crm`: сделки, клиенты, чаты, задачи, настройки)**: сборщики `deals.*` (доска и список, карточка сделки: счета — доменные объекты, их подписи, ссылки и что отменит слияние считаются на сервере), `clients.*`, `chats.*` (строки списка — и для живого обновления `/api/admin/chats/inbox`, открытый диалог), `tasks.*` (`task-detail` → `src/server`), `settings.*` (7 вкладок: секреты только маской, «задано переменной окружения» — с сервера); секрет вебхука Kaspi заводится действием. **Оба allowlist пусты**: в `src/app/**` и `src/components/**` нет прямых импортов `@/server/container` и модулей, кроме транзитивно чистых `domain`/`ui`. Флаг `crm` на проде не включён. Allowlist: `web-v1-strangler` **17 → 0**, `architecture-web-db` **17 → 0**. 26.11 — **Раздел 5.5 (`crm`: остальные API-маршруты CRM)**: ещё 54 маршрута — всё старое приложение `/api/mobile/*`, раздача приложений `/api/admin/ios-app/*`, `/api/ios-app/*`, `/api/admin/mobile-apk` — через `v1SiteProxy("crm")`, доски задач `/api/admin/boards/*` — остатком пути (`{path*}` в `site-routes`); обработчики зовут действия `src/server/crm-actions` напрямую. Тест: параметрический адрес не перехватывает статический ниже по таблице 26.11 — **Пробная выкатка фронта на Vercel** (https://mybooks-trial.vercel.app, регион arn1, без секретов и без `DATABASE_URL`): кабинет, CRM и публичные страницы работают только через API v1; сайт без БД не запускает миграции и фон, пояс магазина — `STORE_TIME_ZONE` (Vercel ставит `TZ=":UTC"`). Из Казахстана TTFB 350–620 мс против 35–70 мс у mybooks.kz — **не переносить** (`docs/microservices/vercel-trial.md`); домен не переключался. |
| A6 | Вебхуки (Kaspi, CloudPayments, GOWA, Zadarma, Google) в api с теми же адресами | `done` 25.11 (`aa9fb46b` + nginx) | api обслуживает те же модули маршрутов сайта; nginx → upstream mybook_hooks (api, запасной — сайт); сверка 7/7; локальные kaspi-pos и GOWA ходят на сайт напрямую (не переключали — 06-operations §2.10). Откат — копия nginx /etc/nginx/backup-2026-11-25-hooks |
| A7 | Выпуск клиентского «MyBooks» в магазины: push клиенту, ссылки на политику и оферту, удаление аккаунта | `in_progress` 25.11 | устройства `meDevicePut`/`meDeviceDelete` (миграция 0110), `appConfig`, удаление аккаунта (`meDeletionInfo`/`meDelete`, миграция 0111, `account-deletion.ts`, `*Privacy`). 25.11 подключена отправка клиентских push (`src/server/client-push.ts` + `subscriptions.ts` + `mobile/lib/client/push.dart`): книга готова (`ordering.print_files_ready`), заказ оплачен (`ordering.order_paid`), отправлен (`ordering.order_status_changed`/`tracking_added`), ответ живого менеджера (`messaging.manager_replied`), 4 языка, жёсткий гейт `notify.auto=off`, регистрация/отписка устройства и переход в книгу/заказ по тапу. До публикации ждут: аккаунты App Store и Google Play, значок 1024 px |
| R1 | ADR 0013, шаг 1: приложение — в отдельный репозиторий [`mybook-mobile`](https://github.com/sanjuniperodee/mybook-mobile) | `done` 26.11 | Приватный репозиторий, история `mobile/` перенесена `git filter-repo` (101 коммит), CI `flutter analyze` + `flutter test`; туда же переехали `ios-adhoc.sh`, `asc.mjs`, `upload-apk.sh` (сборка и Apple). Приём и раздача на `/admin/app` остались здесь (`scripts/mobile/ios-devices.ts`, `upload-apk.ts`, `src/server/ios-app.ts`, `mobile-apk.ts`). Генератор Dart-клиента — здесь: `generate.ts --dart <путь>`, проверка `scripts/contracts/check-dart.ts <checkout>`; задача `mobile-client-pr` в `deploy.yml` делает PR в приложение при секрете `MOBILE_REPO_TOKEN` (заводит владелец). CI `mybook-mobile` зелёный, клиент из него собран и запущен на симуляторе — после этого `mobile/` и скрипты сборки удалены из бэкенда по слову владельца (остался указатель `mobile/MOVED.md`, `/mobile/*` в `.gitignore` — в старых checkout там ключи подписи Android). `dart-client` в CI генерирует клиент во временный пакет с `package:http` и анализирует его строго; проверка «нет кириллицы в `answer_media_sheet.dart`» переехала в тесты приложения |

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
| 2026-11-05 | Claude Opus 5.5 | Память `mybook` (ADR 0010): 1,2 ГБ — нативная память sharp/libvips после прогрева фото-обложек; кэш libvips выключен (обе сборки sharp), jemalloc в PM2 | замер на сервере: 600 → 83 МБ на том же рендере; локально 1150 → 666 МБ без jemalloc; полный vitest | замер `mybook` на проде после выкатки |
| 2026-11-05 | Claude Opus 5.5 | P4+: поток PDF закрывается после 10 мин простоя (`PDF_WORKER_IDLE_MIN`, 0 — не закрывать): поток после вёрстки держал ~0,4 ГБ (1,6 ГБ с ним, 1,2 ГБ без него) | тест простоя в `pdf-pool-limits`, полный vitest 4043 passed; на проде без потока — 1,2 ГБ, почти всё — анонимная память основного процесса | разобрать, что держит 1,2 ГБ в `mybook` |
| 2026-11-05 | Claude Opus 5.5 | P7 закрыт: 114 страниц sitemap и реальный трафик по логу nginx — узкого места нет, p95 ≤ 65 мс; находка — окно выкатки ~0,5 с | `route-latency` тесты | план закрыт |
| 2026-11-05 | Claude Opus 5.5 | P0–P6 выкачены: параллельный CI, `mybook-worker`, лимит потока PDF, границы `src/server` (5 файлов → модули), карта модулей, лог таймингов nginx; Daiyn на сервере остановлен по просьбе владельца | tsc 0, eslint 0 ошибок, vitest 4042+ на чистом TMPDIR, интеграционные тесты дизайнера и видео, next build | P7: неделя наблюдения |
| 2026-11-05 | Claude Opus 5.5 | Замер CI (тесты 224–351 с из 8–15 мин, сборка ~1 мин); решение ADR 0009: монолит + процессы, без Go/Bun; ADR 0001/0002 отложены; новый план P0–P7 | только документы | P1 быстрый CI (нужно «да» на пуш) |
| 2026-11-05 | Claude Opus 5.5 | Ревью плана (`09-review-2026-11-05.md`), правки расхождений в 01–06 (Turborepo, RAM, порт 3044 занят Daiyn, G0 без S3); M0.5 доведён и закоммичен | `tsc` 0, `vitest` 4023 passed / 136 skipped, `next build` зелёный | G0 — решение владельца; без него — M0.6 |

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
