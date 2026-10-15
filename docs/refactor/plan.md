# План рефакторинга

Основа плана — [аудит](audit.md). Шаги идут от наибольшей пользы при наименьшем риске к более рискованным. После каждого шага прогоняются `tsc`, `eslint`, `vitest`; если шаг касается вёрстки — визуальная сверка (фаза 3); каждые 3–4 шага — `next build` и `scripts/refactor/bundles.mjs --compare`. Один шаг — один или несколько атомарных коммитов, и после каждого всё зелёное.

**Статус: согласовано 13.10 («делай идеально, ограничений нет») — выполняется.** Фичи, о которых вы попросили 13.10, сделаны отдельно от рефакторинга (раздел «Фичи»).

Обозначения риска: **Н** — механический шаг, ловится типами и тестами; **С** — затрагивает вид или поведение, нужна визуальная сверка или характеристические тесты; **В** — меняет то, что видит клиент или сотрудник, только после вашего «да».

## Решения по вопросам (13.10)

Ответ «делай идеально, ограничений нет» принят как согласие с рекомендациями. Каждое изменение поведения — отдельным коммитом и в отчёте.

1. **V1 (права сотрудников на книги клиентов)** — закрыть: без `clients.view` или без пройденных IP/2FA сотрудник получает 404 на клиентских книгах, для правки нужен `clients.edit`.
2. **V2 (подделка IP в лимитах)** — закрыть: `clientIp()` → `trustedClientIp()`.
3. **Превью в редакторе** — вариант (а): один компонент, превью рисуется как PDF (обводка, тень, отступ подписи ряда фото).
4. **B2 (3D-книга против PDF)** — правильный PDF (главы подряд): 3D повторяет PDF. PDF не меняется, `LAYOUT_VERSION` из-за B2 не растёт.
5. **B1, B3–B7** — исправить отдельными коммитами после соответствующих шагов рефакторинга.
6. **Часовой пояс** — одна функция «TZ, иначе Алматы» вместо 13 копий.
7. **zod** — для всех входов действий и роутов: мусор вместо id → 400 с текстом вместо 500.

## Фаза 3. Страховочная сетка (до любого рефакторинга) — ✅ готово

| # | Шаг | Что сделано | Файлы |
|---|---|---|---|
| S0 | Набор книг | 23 оформления × A5/квадрат × ru/kk = 92 детерминированные книги без БД: фото в ответах (все рамки, выравнивания, пропорции, ряд из двух), фотостраницы (full, bleed, half, сетки), письма, лид, цитата, списки, стихи, диалог, исправленные заголовки, шаблоны рода; варианты вне матрицы — тонкая книга (добивка до минимума), «голая» (без оглавления, посвящения, писем), другой род и тема, фото 4000×3000 | `tests/fixtures/{books,photos,texts}.ts`, `tests/fixtures.test.ts` |
| S1 | Тест архитектуры с храповиком | Граф импортов по TypeScript AST (статические, `import type`, `import()`, реэкспорты). Baseline — список пар from→to (46 / 5 / 6): новое нарушение роняет тест, исчезнувшее требует убрать строку из baseline | `scripts/refactor/import-graph.mjs`, `tests/architecture.test.ts`, `tests/architecture-baseline.json` |
| S2–S4 | Эталоны PDF и HTML, попиксельная сверка | Снимок: блок и обложка-развёртка в print, растр 150 dpi, sha256 пикселей и байтов PDF без метаданных, структура полос (боксы, размеры фото, шрифты); HTML — развороты `InteriorSpread`, превью редактора, полосы 3D, оборот обложки в Chromium. Сверка с любым коммитом через временный worktree, порог 0, PNG-диффы, кэш эталона по коммиту | `scripts/visual/*`, `tests/visual/README.md`, `npm run visual:check` |
| S5 | Характеристические тесты вёрстки | `buildBookContent`, `estimatePages`, `planFaces`, `contentFingerprint`, `textArea`, `openerFlow` на всём наборе; фактический объём PDF рядом с оценкой; копия оценки редактора (страхует C7); SVG всех шаблонов обложек и оборотов | `tests/characterization/*` |
| S6 | Веб-адаптеры | `api()` (все коды → статусы, ru/kk, zod, 500 без утечки), `checkOrigin`, `requireStaff`/`assertStaff`, IP-allowlist, 2FA, `viewerOf`, переводчики ошибок в действиях; «так сейчас» для V1 и V2 (маркеры `V1:`/`V2:` — перевернуть в E6 и G) | `tests/server-adapters*.test.ts`, `tests/doubles/web.ts` |
| S7 | Сервисы с фейковыми портами | `clients` (профиль, задачи, заметки, упоминания), `production` (печатные файлы: очередь, кэш, `force`, склейка; превью: водяной знак до и после оплаты), `workspace` (свои поля) | `tests/{clients,production,workspace}.test.ts`, `tests/doubles/*` |
| S8 | Критичные потоки | По готовому PDF: кратность и минимум полос, боксы, фото под обрез до края вылета, ни один заголовок не последний на полосе (poppler), глава начинается сразу после начальной полосы. Повторные вебхуки CloudPayments и Kaspi идемпотентны. Чужая книга и файлы чужого заказа недоступны | `tests/pdf-critical.test.ts` (`npm run test:pdf-all` — весь набор), `tests/cloudpayments.test.ts`, `tests/foreign-access.test.ts` |

Отличия от первоначального плана: набор книг — в `tests/fixtures/` (общий для всех проверок), позиции текста в S8 берутся из poppler (`pdftotext -bbox-layout`), а не pdf-lib; сверка PDF дополнительно сравнивает байты и структуру, потому что растр не видит боксов и разрешения фото. Растр зависит от машины (poppler, Chromium, libvips): эталон и текущее дерево снимаются на одной машине.

Найденные при этом баги B8–B14 — в аудите (§9) и в разделе G.

## Фаза 4. Рефакторинг

### A. Быстрые победы (Н) — ✅

| # | Шаг | Цель | Файлы | Проверка |
|---|---|---|---|---|
| A1 | Удалить мёртвое | `BackLink.tsx`; снять `export` у функций, нужных только внутри файла; удалить невостребованные `tick`/`crmTick`/`outboxTick`-экспорты, `MAX_PAYMENT`-дубли и т. п. по отчёту knip | ~40 файлов | knip, tsc |
| A2 ✅ | Единицы и геометрия полосы в одном месте | `MM_TO_PT`/`PT_TO_MM` в `formats.ts`; `pageSide(format)` и `textArea()` вместо 5 копий `side` и 4 копий ширины и высоты; `hexAlpha` → `lib/color.ts` | `lib/book/*`, `components/interior/*`, `PagePreview`, `pdf/interior.tsx`, `book3d/pages.tsx`, `CoverBack`, `ProofTextarea` | S3, S4: 0 отличий |
| A3 | `lib/utils.ts` по предметам | `cn` → `lib/class-names.ts` (без словарей), `formatDate`/`nowMs` → `lib/dates.ts` | все импорты `@/lib/utils` | tsc, бандлы |
| A4 | Подписи тарифов и доставки — один словарь | `ordering/ui/labels.ts`, тексты те же | 5 + 3 места в `app/admin` | tsc, снимок текстов |
| A5 | «Заказ оплачен» — одно правило | `isPaid(status)` в домене `ordering` и SQL-фрагмент в read-модели. Заменяются три одинаковые проверки в `app/`. SQL с другой семантикой (`paid_at`) не трогаю, но документирую | `ordering/domain/OrderStatus.ts`, 3 файла `app/` | tsc, тесты |
| A6 | Видимость книги — одно правило | `queries.visibleBook` и `photoFor` берут правило из домена `Book.isVisibleTo` | `authoring/*` | `authoring.test.ts` |

### B. Границы модулей (Н–С) — ✅ нарушений 0 / 0 / 0 (было 46 / 5 / 6), линтер без исключений

| # | Шаг | Цель | Файлы | Проверка |
|---|---|---|---|---|
| B1 ✅ | Общий словарь в `shared/domain` | Каналы, график работы, упоминания, мета сделок и правил, подпись сотрудника `staffLabel` переезжают из чужих доменов. Старые места реэкспортируют на время переезда, затем реэкспорты удаляются | `shared/domain/{channels,schedule,mentions,staff,dealSources,templates,slug}.ts`, ~15 импортов | S1: −14 нарушений между модулями и −1 из общего ядра (схема берёт источник сделки из `shared/domain`) |
| B2 ✅ | Порты рабочего пространства | `SettingsReader`, `StaffNotifier`, `LiveFeed`, `CustomFieldsReader`, `WorkSchedule` в `shared/application`; реализации в `workspace/infrastructure`; модули получают их в конструкторе из `container` | `messaging`, `automation`, `assistant`, `telephony`, `sales`, `clients`, `marketing`, `access` | S1: −23 (аудит насчитал 27 вместе с четырьмя импортами графика и упоминаний из `workspace/domain` — их убрал B1); тесты модулей с фейками |
| B3 ✅ | Порты между модулями | `GiftPdfRenderer` (`ordering` ← `production`), `ReviewLinks` (`notifications` ← `feedback`), `ConversationReader` (`assistant` ← `messaging`), `LoginFormat` (`access` ← `identity`) | 4 модуля + `container.ts` | S1: −9 (кроме четырёх портов — ещё `reporting` ← `access`/`clients` и `workspace` ← `access`, четыре типовых связи: права и сегменты переехали в `shared/domain`, отчёты видят сотрудника через свой `StaffView`). `LoginFormat` объявлен в `access/domain/StaffContext.ts`, а не в `application`: ему нужен `StaffContext` из домена, а домен не импортирует `application` |
| B4 ✅ | Модули не ходят в `server/` и `components/` | `ChatMessage` переезжает в `messaging`; `chatView`/`email` получают почтовый порт вместо `container()`; журнал `access` берёт адрес запроса портом `RequestOrigin` (не `RateLimiter`: адрес нужен как свойство записи, а не как ключ лимита; вне запроса — `null`); источник фото обложек — в `production/infrastructure` | `messaging/infrastructure/*`, `access/infrastructure/persistence.ts`, `server/cover-photos.ts` | S1: −5 (`moduleOutward` → 0) |
| B5 ✅ | Схема БД по владельцам | `schema.ts` (1041 строка) делится на файлы по владельцам таблиц; `shared/infrastructure/db/schema.ts` остаётся сборным файлом для drizzle-kit, `db`, отчётов и `lib`. Общее ядро больше не импортирует домены (−5; шестую связь убрал B1): значения колонок — статусы заказа и сертификата, снимок печати, статус и фото отзыва, события этапа, типы своих полей — объявлены в `shared/domain` (`orders`, `reviews`, `stageMilestones`, `customFields`), `customFieldTypes` и `CustomValues` больше не двоятся. SQL не меняется. **Файлы лежат в `shared/infrastructure/db/schema/<модуль>.ts`, а не в `modules/<m>/infrastructure/schema.ts`**: сборный файл в `shared`, который импортировал бы модули, вернул бы нарушения `shared → modules` (а по плану B6 их ноль), внешние ключи идут через границы контекстов (заказ → клиент и книга, сделка → заказ), и `db.query` с отчётами читают таблицы всех — файлам модулей пришлось бы импортировать друг друга | `shared/infrastructure/db/schema/{access,authoring,automation,clients,feedback,identity,marketing,messaging,notifications,ordering,referrals,sales,telephony,workspace,outbox}.ts` + `relations.ts` + `columns.ts` (17 файлов, самый большой — 183 строки); `drizzle.config.ts` не менялся (читает сборный файл) | **`drizzle-kit generate` → «No schema changes»**, 156 операторов `drizzle-kit export` совпадают; `tests/schema.test.ts` (схема против снимка миграций, сборный файл, связи `db.query`); интеграционные тесты без БД не запускаются |
| B6 ✅ | Линтер без исключений | Модуль не импортирует другой модуль вообще (даже фасад, `domain`, `ui`) и не знает о `server`, `components`, `app`; `shared` и `lib` не знают о модулях и слое представления; `src/server` не зависит от `components`/`app` и видит модули через фасады, `domain` и `ui`. Границы «по пути» — `import/no-restricted-paths` (видит `@/…`, относительные пути, `import()`, реэкспорты, `import type`), запреты «по имени» — `no-restricted-imports`. Храповик S1 → 0: baseline пуст. Условия для `src/server` без исключений: адаптеры production отдаёт фасад (контейнер не заходит в `infrastructure`), `server/spreadSample.ts` не берёт тип у компонента | `eslint.config.mjs`, `tests/architecture-baseline.json`, `modules/production/index.ts`, `server/{container,spreadSample}.ts` | lint (0), S1 (0 / 0 / 0) |

### C. Книга: одна сущность — одно место (С, визуальная сверка обязательна) — C1, C2 ✅ (PDF: 0 отличий на 192 ключах и 2940 полосах; `COVER_ART_VERSION` один раз сменился из-за правки `formats.ts`, рисунки обложек те же)

| # | Шаг | Цель | Файлы | Проверка |
|---|---|---|---|---|
| C1 ✅ | Спецификация набора в `lib/book` | Все отбивки, кегли и отступы блоков ответа, капители, заголовка с линейкой, колонтитула, колонцифры, начальной полосы, оглавления — данными в `lib/book/typesetting.ts`, в pt и мм. PDF и `BookPage` только переводят их в единицы своей среды | `lib/book/typesetting.ts`, `pdf/interior.tsx`, `BookPage.tsx` | S3, S4: 0 отличий |
| C2 ✅ | Цвета и рамки фото | Константы бумаги, поляроида, подписи и паспарту в `interiors`; `photoCaptionFace(design)` для подписи | `lib/book/interiors/*`, оба рендерера | S3, S4 |
| C3 ✅ | Разбить PDF-документ | `pdf/interior/` по полосам: `TitlePage`, `Colophon`, `Dedication`, `Toc`, `Opener`, `PhotoPage`, `ChapterBody` (`TextBlock`, `InlineRows`, `Heading`, `Divider`), `Folio`, `RunningHead` | `modules/production/infrastructure/pdf/interior/*` | S3: 0 отличий, страниц столько же |
| C4 ✅ | Разбить `BookPage` | `components/interior/{graphics,typography,folio,pages,entry}.tsx`; `Sheet` → `PageSurface` (конфликт имени с листом 3D) | `components/interior/*` | S4 |
| C5 ✅ | Решения вёрстки — чистая функция | `refineFlow`: разбор раскладки react-pdf остаётся в адаптере, решения (разрыв перед заголовком, масштаб ряда, концовка) уходят в `lib/book/flow-decisions.ts` с юнит-тестами | `pdf/flow.ts`, `lib/book/flow-decisions.ts` | `pdf-flow.test.ts`, S3 |
| C6 | Превью в редакторе на общих компонентах | Ряд фото и ответ — компоненты `BookPage` с интерактивным слоем поверх; разбивка колонок — общий хелпер для `PagePreview` и `book3d/pages.tsx`. **Вариант зависит от ответа на вопрос 3** | `PagePreview.tsx` → `editor/preview/*` | S4; при варианте (а) отличия согласованы |
| C7 | Сборка содержимого книги — одна | Первым коммитом без изменения поведения: экспорт маппинга глав из `src` и перевод на него стенда HTML (`scripts/visual/html-data.ts`). Затем оценка в редакторе строится той же функцией, что `buildBookContent`; копия старой оценки в `tests/characterization/editor-estimate.test.ts` удаляется, а расхождения B3/B14 исправляются отдельным коммитом | `lib/book/layout.ts`, `QuestionsEditor` | S5 |
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
| E4 ✅ | Единые ошибки | Реестр «код домена → статус» в одном месте (`server/errors.ts`). `api()` понимает `ForbiddenError` (500 → 403, решение E4). Помощники для server actions вместо трёх локальных переводчиков: `actionError(err, ...ожидаемые)` (покупатель, на языке запроса) и `staffActionError(err, ...ожидаемые)` (сотрудник CRM, всегда по-русски: cookie языка сайта на тексты админки не влияет); `bad()` двух роутов платежей заменён `HttpError` и словарём `admin` (`src/i18n/admin.ts`, только русский: сотрудники CRM). `XError.is()` вместо `instanceof`: `PaymentError`, `ReceiptError`, `WazzupError` — на `contextError`, `HttpError`/`ForbiddenError` — с меткой. Исправления отдельными коммитами: B5 (`Origin: null` → 403), B10 (`notFound` → 404 без учёта регистра, `DomainError.params` в текстах), B11 (тексты вместо кодов, `orThrow` без потери `AccessError`, форма заказа по-русски, один текст `twoFactorCode`). Не тронуты: местные `err.message`-обработчики контекстов с готовым текстом для сотрудника (clients, telephony, assistant, workspace, `kaspiError`, `gowaError`) | S6, `tests/errors.test.ts`, `tests/server-routes-payments.test.ts` |
| E5 | zod для всех входов | Схемы для аргументов-id и `FormData` в действиях админки и роутах платежей; тексты ошибок те же | `actions.mjs`: без zod — 0 |
| E6 | Права (решение 1) | `viewerOf` от `getStaff()` + `clients.view`/`clients.edit`; тест «сотрудник без права → 404». Страница заказа клиента и файлы заказа — тоже через права CRM | все тесты `V1:` (`server-adapters-access`, `foreign-access`) переворачиваются |

### F. Производительность и надёжность (С)

| # | Шаг | Цель | Проверка |
|---|---|---|---|
| F1 | Редактор не перерисовывает книгу на каждый символ | Главы превью — `memo`-компоненты с ключом по содержимому главы; оценка страниц и превью через `useDeferredValue`; `liveKey` по главам вместо `JSON.stringify` всей книги; замер — только у изменённой главы | React Profiler на стенде S4: число коммитов и время на символ до и после, зафиксировать в отчёте |
| F2 | Словари в клиенте | Серверные пространства (`mail`, `legal`) убрать из клиентского словаря; клиент получает словарь текущего языка без второго | `bundles.mjs --compare`: −20…−30 KiB gz на каждой странице |
| F3 | Каталог обложек лениво | Шаблоны обложек грузятся динамически там, где показывается выбор | `bundles.mjs` |
| F4 | N+1 | `findByIds` в массовых операциях со сделками; `findByCodes` для приглашений; `saveSettings` одним запросом в транзакции (B7, если согласовано) | тесты, счётчик запросов в интеграционном тесте |
| F5 | Утечки | `track()` для геометрии корешка, снятие `wheel`; LRU-предел у `useCoverImage` и кэша `/api/covers` | ручная проверка памяти в Chromium: листание шаблонов, открыть и закрыть 3D ×20 |

### G. Исправления после рефакторинга (каждое — отдельный коммит)

V1, V2 — решения 1–2 (тесты с маркерами `V1:` и `V2:` переворачиваются). B1 входит в D2, B2 — решение 4, B3 и B14 входят в C7, B4 — в E2, B10 и B11 — в E4. B5 (`Origin: null` → 403 вместо 500), B6 (блокировка в платежах), B7 (транзакция настроек), B12 (мелочи clients/production), B13 (заметка «нужен возврат» при повторной оплате CloudPayments).

B8 (книга не собирается из-за разделителя на границе полосы) и B9 (водяной знак превью в квадрате) ✅ исправлены сразу после фазы 3, `LAYOUT_VERSION` 3 → 4 (кэш превью пересобирается: в квадрате на фото под обрез появился водяной знак). Растр печати 92 книг набора не изменился.

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

| W2 | WhatsApp и Kaspi настраиваются из админки | GOWA: сайт сам заводит в шлюзе устройство магазина (`/devices`, `X-Device-Id`) с вебхуком и секретом — на стороне шлюза ничего настраивать не нужно; адрес шлюза, логин:пароль и адрес для событий — в «Интеграциях». Kaspi: адрес сервиса с проверкой связи; вебхук без общего секрета — повод сверить счёт с Kaspi. Переменные окружения для адресов стали значениями по умолчанию, которые админка может изменить. В docker compose оба сервиса запускаются сами (ключ kaspi-pos создаётся сам); для PM2 — `deploy/sidecars.sh` (зафиксированные версии, сверка контрольной суммы, только localhost), деплой сайта их не перезапускает | ✅ готово |

Новые фичи не добавили ни одного импорта между модулями: `scripts/refactor/imports.mjs` по-прежнему показывает 46 / 5 / 6.
