# План рефакторинга

Основа плана — [аудит](audit.md). Шаги идут от наибольшей пользы при наименьшем риске к более рискованным. После каждого шага прогоняются `tsc`, `eslint`, `vitest`; если шаг касается вёрстки — визуальная сверка (фаза 3); каждые 3–4 шага — `next build` и `scripts/refactor/bundles.mjs --compare`. Один шаг — один или несколько атомарных коммитов, и после каждого всё зелёное.

**Статус: фазы 1–2 готовы, жду согласования.** Две фичи, о которых вы попросили 13.10, сделаны отдельно от рефакторинга (раздел «Фичи»).

Обозначения риска: **Н** — механический шаг, ловится типами и тестами; **С** — затрагивает вид или поведение, нужна визуальная сверка или характеристические тесты; **В** — меняет то, что видит клиент или сотрудник, только после вашего «да».

## Вопросы, на которые нужен ответ до начала

1. **V1 (права сотрудников на книги клиентов).** Закрыть: сотрудник без `clients.view` или не прошедший IP/2FA получает 404 на клиентских книгах, для правки нужен `clients.edit`. Да?
2. **V2 (подделка IP в лимитах).** Перевести `clientIp()` на `trustedClientIp()`. Да?
3. **Превью в редакторе (§3.1 аудита).** Ряд фото в `PagePreview` нарисован не так, как в PDF и `BookPage` (обводка, тень, отступ подписи). Варианты:
   - (а) свести к одному компоненту — превью станет как PDF;
   - (б) общий код с явными параметрами превью — вид не меняется, но «одно место» выполняется не полностью.

   Рекомендую (а).
4. **B2 (3D-книга против PDF).** Что правильно: глава всегда с правой полосы и с пустой левой (как в 3D) или подряд (как в PDF)? Если «с правой», это изменение PDF и `LAYOUT_VERSION`.
5. **B1, B3, B4, B6, B7, B5.** Исправлять отдельными коммитами после рефакторинга? B1 (версия обложек) и B3 (оценка страниц) видит клиент. B4 (транзакция платежа с чеком) нужна для тонкого `app/`.
6. **Часовой пояс.** Сейчас в одних местах `process.env.TZ || "Asia/Almaty"`, в других жёстко `Asia/Almaty`. Свести к одной функции с поведением «TZ, иначе Алматы»? Docker-образ задаёт `TZ=Asia/Almaty`, поэтому в Docker поведение не изменится; при PM2 — тоже, если `TZ` не задан или равен `Asia/Almaty`.
7. **zod для некорректного ввода.** Вызов действия с мусором вместо id сейчас даёт 500, после — 400 с текстом. Приемлемо?

## Фаза 3. Страховочная сетка (до любого рефакторинга)

| # | Шаг | Цель | Файлы | Риск | Проверка |
|---|---|---|---|---|---|
| S1 | Тест архитектуры с храповиком | Число нарушений границ (46 + 5 + 6) не может расти, в том числе через динамический `import()`. По мере шагов B* порог опускается до 0 | `tests/architecture.test.ts`, использует логику `scripts/refactor/imports.mjs` | Н | Тест красный при новом межмодульном импорте |
| S2 | Эталонные PDF | Блок и обложка-развёртка, детерминированно, без БД | `tests/visual/fixtures.ts`, `scripts/visual/pdf-golden.ts` | Н | Повторный прогон даёт байт-в-байт тот же результат после нормализации метаданных |
| S3 | Попиксельная сверка PDF | Сравнение текущего дерева с эталонным коммитом: число страниц и растр каждой полосы (pdftoppm, 150 dpi), порог — 0 отличий. При отличиях — PNG-диффы в `tests/visual/out/` (вне git) | `scripts/visual/pdf-compare.ts` | Н | Сверка коммита с самим собой даёт 0 |
| S4 | Снимки HTML | `InteriorSpread` (4 вида) и `PagePreview` в Chromium через Playwright на тех же данных, сравнение хешей пикселей | `scripts/visual/html-*.ts`, страница-стенд собирается esbuild из `node_modules` | Н | То же |
| S5 | Характеристические тесты: вёрстка | `buildBookContent`, `estimatePages`, `planFaces`, `contentFingerprint` (страхует `LAYOUT_VERSION`), `textArea` и `openerFlow` на наборе книг | `tests/characterization/*.test.ts` | Н | Снимки значений |
| S6 | Характеристические тесты: веб-адаптеры | `api()`: перевод ошибок в статусы и тексты на ru/kk; `checkOrigin`; `viewerOf`; `requireStaff`/`assertStaff` (редиректы, 404, исключения) | `tests/server-adapters.test.ts` | Н | Фиксируют **текущее** поведение, включая V1, отдельным явным тестом «так сейчас» |
| S7 | Тесты сервисов с фейковыми портами | `clients` (профиль, заметки, задачи, @упоминания); `production` (`PrintFilesService`: очередь, кэш, `force`; `BookPreviewService`: водяной знак до и после оплаты); `workspace` (`CustomFieldsService`) | `tests/clients.test.ts`, `tests/production.test.ts`, `tests/workspace.test.ts` | Н | — |
| S8 | Тесты критичных потоков | PDF: фото «под обрез» касается края вылета; ни один заголовок не стоит последним на полосе (по готовому PDF через позиции текста pdf-lib); кратность для всех оформлений. Оплата: повторный вебхук идемпотентен | `tests/pdf-flow.test.ts`, `tests/pdf.test.tsx`, `tests/ordering.test.ts` | Н | — |

Визуальный набор: каждое из 23 оформлений (`interiorDesigns`) × A5 и квадрат × ru и kk. В книгах есть:
- фото в ответах (все рамки и выравнивания, ряд из двух);
- фотостраницы (full, bleed, half, grid);
- письма близких;
- короткие и длинные ответы;
- списки, стихи, цитата, лид;
- посвящение и оглавление.

Фото генерируются `sharp` детерминированно. Для HTML — те же книги, по одной на оформление и формат.

## Фаза 4. Рефакторинг

### A. Быстрые победы (Н)

| # | Шаг | Цель | Файлы | Проверка |
|---|---|---|---|---|
| A1 | Удалить мёртвое | `BackLink.tsx`; снять `export` у функций, нужных только внутри файла; удалить невостребованные `tick`/`crmTick`/`outboxTick`-экспорты, `MAX_PAYMENT`-дубли и т. п. по отчёту knip | ~40 файлов | knip, tsc |
| A2 | Единицы и геометрия полосы в одном месте | `MM_TO_PT`/`PT_TO_MM` в `formats.ts`; `pageSide(format)` и `textArea()` вместо 5 копий `side` и 4 копий ширины и высоты; `hexAlpha` → `lib/color.ts` | `lib/book/*`, `components/interior/*`, `PagePreview`, `pdf/interior.tsx`, `book3d/pages.tsx`, `CoverBack`, `ProofTextarea` | S3, S4: 0 отличий |
| A3 | `lib/utils.ts` по предметам | `cn` → `lib/class-names.ts` (без словарей), `formatDate`/`nowMs` → `lib/dates.ts` | все импорты `@/lib/utils` | tsc, бандлы |
| A4 | Подписи тарифов и доставки — один словарь | `ordering/ui/labels.ts`, тексты те же | 5 + 3 места в `app/admin` | tsc, снимок текстов |
| A5 | «Заказ оплачен» — одно правило | `isPaid(status)` в домене `ordering` и SQL-фрагмент в read-модели. Заменяются три одинаковые проверки в `app/`. SQL с другой семантикой (`paid_at`) не трогаю, но документирую | `ordering/domain/OrderStatus.ts`, 3 файла `app/` | tsc, тесты |
| A6 | Видимость книги — одно правило | `queries.visibleBook` и `photoFor` берут правило из домена `Book.isVisibleTo` | `authoring/*` | `authoring.test.ts` |

### B. Границы модулей (Н–С)

| # | Шаг | Цель | Файлы | Проверка |
|---|---|---|---|---|
| B1 | Общий словарь в `shared/domain` | Каналы, график работы, упоминания, мета сделок и правил, подпись сотрудника `staffLabel` переезжают из чужих доменов. Старые места реэкспортируют на время переезда, затем реэкспорты удаляются | `shared/domain/{channels,schedule,mentions,staff}.ts`, ~15 импортов | S1: −14 нарушений |
| B2 | Порты рабочего пространства | `SettingsReader`, `StaffNotifier`, `LiveFeed`, `CustomFieldsReader`, `WorkSchedule` в `shared/application`; реализации в `workspace/infrastructure`; модули получают их в конструкторе из `container` | `messaging`, `automation`, `assistant`, `telephony`, `sales`, `clients`, `marketing`, `access` | S1: −27; тесты модулей с фейками |
| B3 | Порты между модулями | `GiftPdfRenderer` (`ordering` ← `production`), `ReviewLinks` (`notifications` ← `feedback`), `ConversationReader` (`assistant` ← `messaging`), `LoginFormat` (`access` ← `identity`) | 4 модуля + `container.ts` | S1: −4 |
| B4 | Модули не ходят в `server/` и `components/` | `ChatMessage` переезжает в `messaging`; `chatView`/`email` получают почтовый порт вместо `container()`; лимиты для `access` — порт `RateLimiter`, уже есть в общем ядре; источник фото обложек — в `production/infrastructure` | `messaging/infrastructure/*`, `access/infrastructure/persistence.ts`, `server/cover-photos.ts` | S1: −5 |
| B5 | Схема БД по модулям | `schema.ts` (1022 строки) делится на `modules/<m>/infrastructure/schema.ts`; `shared/infrastructure/db/schema.ts` остаётся сборным реэкспортом для drizzle-kit, отчётов и `lib`. Общее ядро больше не импортирует домены (−6). SQL не меняется | `drizzle.config.ts` (массив путей), 17 новых файлов | **`drizzle-kit generate` → «No schema changes»**; интеграционные тесты |
| B6 | Линтер без исключений | Модуль не импортирует чужой модуль вообще (даже фасад), `domain` и `ui`; модуль не импортирует `server`, `components`, `app`; `shared` не импортирует модули; правило для `src/server`. Храповик S1 → 0 | `eslint.config.mjs`, `tests/architecture.test.ts` | lint, S1 |

### C. Книга: одна сущность — одно место (С, визуальная сверка обязательна)

| # | Шаг | Цель | Файлы | Проверка |
|---|---|---|---|---|
| C1 | Спецификация набора в `lib/book` | Все отбивки, кегли и отступы блоков ответа, капители, заголовка с линейкой, колонтитула, колонцифры, начальной полосы, оглавления — данными в `lib/book/typesetting.ts`, в pt и мм. PDF и `BookPage` только переводят их в единицы своей среды | `lib/book/typesetting.ts`, `pdf/interior.tsx`, `BookPage.tsx` | S3, S4: 0 отличий |
| C2 | Цвета и рамки фото | Константы бумаги, поляроида, подписи и паспарту в `interiors`; `photoCaptionFace(design)` для подписи | `lib/book/interiors/*`, оба рендерера | S3, S4 |
| C3 | Разбить PDF-документ | `pdf/interior/` по полосам: `TitlePage`, `Colophon`, `Dedication`, `Toc`, `Opener`, `PhotoPage`, `ChapterBody` (`TextBlock`, `InlineRows`, `Heading`, `Divider`), `Folio`, `RunningHead` | `modules/production/infrastructure/pdf/interior/*` | S3: 0 отличий, страниц столько же |
| C4 | Разбить `BookPage` | `components/interior/{graphics,typography,folio,pages,entry}.tsx`; `Sheet` → `PageSurface` (конфликт имени с листом 3D) | `components/interior/*` | S4 |
| C5 | Решения вёрстки — чистая функция | `refineFlow`: разбор раскладки react-pdf остаётся в адаптере, решения (разрыв перед заголовком, масштаб ряда, концовка) уходят в `lib/book/flow-decisions.ts` с юнит-тестами | `pdf/flow.ts`, `lib/book/flow-decisions.ts` | `pdf-flow.test.ts`, S3 |
| C6 | Превью в редакторе на общих компонентах | Ряд фото и ответ — компоненты `BookPage` с интерактивным слоем поверх; разбивка колонок — общий хелпер для `PagePreview` и `book3d/pages.tsx`. **Вариант зависит от ответа на вопрос 3** | `PagePreview.tsx` → `editor/preview/*` | S4; при варианте (а) отличия согласованы |
| C7 | Сборка содержимого книги — одна | Оценка в редакторе строится той же функцией, что `buildBookContent` (без исправления B3, если не согласовано: расхождения повторены явно и помечены) | `lib/book/layout.ts`, `QuestionsEditor` | S5 |
| C8 | `LAYOUT_VERSION` | Если вывод PDF не изменился, версия не трогается; если изменился (только по согласованию) — увеличивается | `pdf/render.tsx` | S3 |

### D. Большие файлы — по смыслу (Н–С)

| # | Шаг | Цель | Проверка |
|---|---|---|---|
| D1 | `QuestionsEditor` (1031) | Хуки `useQuestionsDraft` (состояние, автосохранение, черновик), `usePageEstimate`, `useInlinePhotos`; компоненты `QuestionNav`, `AnswerPanel`, `PhotoStrip`, `PreviewPane`, `Toolbar` | tsc, e2e `scripts/e2e-dictation.mjs`, `e2e-inline-photo.mjs` |
| D2 | `covers-client-photo` (1087), `covers-collection`, `covers-photo` | `lib/book/covers/<семья>/<шаблон>.ts` + общий `svg-kit.ts`; порядок и реестр — в индексе. **Список файлов для `COVER_ART_VERSION` в `next.config.ts` заменяется на все файлы `lib/book/covers/**`.** Это и исправление B1: версия один раз изменится | `covers.test.ts` (SVG каждого шаблона байт-в-байт до и после), S3 для обложек |
| D3 | `interiors.ts` (835), `interior-art.ts` (662) | `interiors/{types,legacy,collection/*,typesetting}.ts`; `interior-art/{glyphs,frames,opener-art,geometry}.ts` | `interiors.test.ts`, S3, S4 |
| D4 | `scene.ts` (794), `BookViewer3D` (697), `BookViewerGL` (448) | `webgl/{materials,textures,geometry,BookScene}.ts`; общие хуки `useFullscreen`, `useBookKeys` (сейчас 15 строк копии) | `flipbook`/`page-curl` тесты, ручная проверка 3D |
| D5 | `SettingsForms` (714), `settings/actions.ts` (372) | По форме на интеграцию + общие `SecretField`, `EnvLockedField`; zod-схемы рядом с действиями | tsc, `scripts/shot-admin.mjs` до и после |
| D6 | `CheckoutForm` (471, сложность 67) | Расчёт суммы — из `ordering/ui` (как на сервере), секции: тариф, доставка, адрес, промокод, итог | `ordering.test.ts`, e2e `e2e-order.mjs` |
| D7 | Страницы админки со сложностью > 40 (`deals/[id]`, `clients/[id]`, `orders/[id]`, клиентский `orders/[id]`) | Модель экрана строится в `reporting` (одна функция — один экран), страница раскладывает секции | tsc, `shot-admin.mjs` |
| D8 | Каталоги-данные (`landings`, `articles`, `love`, словари `books`) | По странице или статье на файл — только если это не мешает поиску текстов. Иначе оставить с обоснованием | tsc |

### E. Тонкий `app/` и единые ошибки (С)

| # | Шаг | Цель | Проверка |
|---|---|---|---|
| E1 | «Завести клиента» → сервис | `ClientOnboardingService` в `clients/application` с портами к `identity`, `sales`, `clients`; действие только разбирает форму и возвращает ответ. Тексты заметок и задач те же | характеристический тест на фейках: какие команды и в каком порядке |
| E2 | «Принять платёж с чеком» → сервис | `sales.payments.acceptWithReceipt` (платёж, чек, заметка, письмо, аудит). Роут — разбор multipart. Транзакция — только если B4 согласован | тест сервиса |
| E3 | Доступ к файлам заказа → домен | `canDownloadFile(order, plan, kind, staff)` в `ordering`; роут — разбор и ответ | `ordering.test.ts` |
| E4 | Единые ошибки | Реестр «код домена → статус» в одном месте (`server/errors.ts`). `api()` понимает `ForbiddenError` (если согласовано: 500 → 403). Помощник `actionError(err)` для server actions вместо трёх локальных переводчиков. `XError.is()` вместо `instanceof` | S6 |
| E5 | zod для всех входов | Схемы для аргументов-id и `FormData` в действиях админки и роутах платежей; тексты ошибок те же | `actions.mjs`: без zod — 0 |
| E6 | Права (после «да» по вопросу 1) | `viewerOf` от `getStaff()` + `clients.view`/`clients.edit`; тест «сотрудник без права → 404» | S6 переворачивается на новое поведение |

### F. Производительность и надёжность (С)

| # | Шаг | Цель | Проверка |
|---|---|---|---|
| F1 | Редактор не перерисовывает книгу на каждый символ | Главы превью — `memo`-компоненты с ключом по содержимому главы; оценка страниц и превью через `useDeferredValue`; `liveKey` по главам вместо `JSON.stringify` всей книги; замер — только у изменённой главы | React Profiler на стенде S4: число коммитов и время на символ до и после, зафиксировать в отчёте |
| F2 | Словари в клиенте | Серверные пространства (`mail`, `legal`) убрать из клиентского словаря; клиент получает словарь текущего языка без второго | `bundles.mjs --compare`: −20…−30 KiB gz на каждой странице |
| F3 | Каталог обложек лениво | Шаблоны обложек грузятся динамически там, где показывается выбор | `bundles.mjs` |
| F4 | N+1 | `findByIds` в массовых операциях со сделками; `findByCodes` для приглашений; `saveSettings` одним запросом в транзакции (B7, если согласовано) | тесты, счётчик запросов в интеграционном тесте |
| F5 | Утечки | `track()` для геометрии корешка, снятие `wheel`; LRU-предел у `useCoverImage` и кэша `/api/covers` | ручная проверка памяти в Chromium: листание шаблонов, открыть и закрыть 3D ×20 |

### G. Исправления после рефакторинга (каждое — отдельный коммит, только по «да»)

V1, V2 — вопросы 1–2. B1 входит в D2, B2 — вопрос 4, B3 входит в C7, B4 входит в E2. B5 (`Origin: null` → 403 вместо 500), B6 (блокировка в платежах), B7 (транзакция настроек).

## Фаза 5. Отчёт

`docs/refactor/report.md`:
- что сделано;
- метрики до и после (по тем же скриптам);
- что осталось и почему;
- все баги и решения по ним;
- места, где поведение изменилось по согласованию;
- `LAYOUT_VERSION`.

## Фичи (в работе с 13.10 по вашей просьбе, вне рефакторинга)

| # | Фича | Суть | Статус |
|---|---|---|---|
| P1 | Автоматическая оплата Kaspi вместо «Я оплатил(а)» и ручной смены статуса | Как в mytest.kz: счёт Kaspi Pay на номер клиента или QR через self-hosted [kaspi-pos-automation](https://github.com/tapter-dev/kaspi-pos-automation) (MIT). Заказ подтверждается подписанным вебхуком (`X-Webhook-Signature`, HMAC-SHA256) и фоновой сверкой статуса. Привязка кассира по SMS-коду — в «Интеграциях». CloudPayments и ручной режим остаются запасными | ✅ готово: миграция 0030 `payment_invoices`, 21 юнит-тест + интеграционный |
| W1 | Свой WhatsApp-шлюз вместо Wazzup | [GOWA / go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice) v9.6.0 (MIT, Go, около 50 МБ памяти, бесплатно медиа и несколько номеров, вебхуки с `X-Hub-Signature-256`). Адаптер рядом с Wazzup, выбор в «Интеграциях»; входящие с вложениями, эхо с телефона, статусы доставки; QR-привязка; прокси вложений; при переходе диалоги не рвутся; сервис в `docker-compose.yml` | ✅ готово: 15 тестов. Живой шлюз не запускался: в окружении нет Docker, проверено по документации и исходникам |

Новые фичи не добавили ни одного импорта между модулями: `scripts/refactor/imports.mjs` по-прежнему показывает 46 / 5 / 6.
