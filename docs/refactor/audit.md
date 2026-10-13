# Аудит перед рефакторингом

Состояние на коммит `8f63548` (ветка `claude/funny-tesla-gsqj79`, 13.10.2026). Код при аудите не менялся. Каждая цифра ниже воспроизводится командой из раздела «Как перепроверить», сырые отчёты лежат в [`baseline/`](baseline/).

## 0. Коротко

- **Архитектура в целом здоровая.** Модульный монолит с DDD, корень композиции, outbox, линтер границ — всё это уже есть. Главные долги: 46 прямых импортов между модулями (27 из них — в `workspace`), обращения модулей к `server/` и `components/`, общее ядро `shared` зависит от модулей.
- **Три рендерера книги считают одно и то же по-разному.** Это PDF (`pdf/interior.tsx`), `BookPage` и `PagePreview`, плюс `book3d/pages.tsx` и `server/spreadSample.ts`. Поля, полоса набора, отбивки блоков, рамки фото и подписи заданы числами в каждом рендерере отдельно. Превью в редакторе уже расходится с PDF в мелочах: рамки фото, тень, отступ подписи.
- **Тонкого `app/` пока нет.** Сценарии «завести клиента», «принять платёж с чеком», «доступ к файлам заказа» целиком лежат в server actions и роутах.
- **Тесты.** 736 зелёных, 12 интеграционных тоже проходят на локальном PostgreSQL. Ни одного теста нет у модуля `clients`, у `production/application` (печатные файлы и предпросмотр), у веб-адаптеров прав (`server/access.ts`, `server/api.ts`, `server/books.ts`) и у компонентов.
- **Найдены 2 уязвимости и 7 багов** (раздел 9). Ничего не исправлено.

## 1. Базовые метрики «до»

| Метрика | Значение | Как снято |
|---|---|---|
| `npx tsc --noEmit` | 0 ошибок, 52 с | `time npx tsc --noEmit` |
| `npx eslint src tests` | 0 ошибок, 0 предупреждений, 56 с | `time npx eslint src tests` |
| `npx vitest run` | 46 файлов, 736 ✓ / 11 пропущено, 28,5 с (весь прогон 30 с) | `npx vitest run` |
| Интеграционные тесты | 3 файла, 12 ✓, 2,8 с (локальные PostgreSQL 16 и Redis) | `INTEGRATION=1 DATABASE_URL=… REDIS_TEST_URL=… npx vitest run tests/*.integration.test.ts` |
| Самые медленные тесты | `pdf.test.tsx` 19,1 с, `pdf-photos` 10,7 с, `covers` 6,3 с, `pdf-frames` 2,3 с | `vitest --reporter=json` |
| `npx next build` | успешно, 110 с, 88 страниц. Без БД в логе ошибки подключения при пререндере витрины отзывов; с БД их нет | `time npx next build` |
| Клиентский JS всего | 2 611 KiB (`.next/static/chunks`) | `node scripts/refactor/bundles.mjs` |
| JS первой загрузки | от 218 KiB gz (`/_not-found`) до 291 KiB gz (`/books/[id]/cover`) | там же, по маршрутам: [`baseline/bundles.json`](baseline/bundles.json) |
| Схема и миграции | `drizzle-kit generate` → «No schema changes» | `npx drizzle-kit generate` |
| Размер кода | 669 файлов, 65 824 строки | `node scripts/refactor/complexity.mjs` |
| Файлы > 300 строк | 43 | там же |
| Функции > 60 строк / сложность > 15 / вложенность > 4 | 139 / 68 / 16 | там же |
| `eslint-disable` | 32: 21 × `no-img-element`, 6 × `set-state-in-effect`, 3 × `alt-text`, 2 × `exhaustive-deps` | `grep -rn eslint-disable src tests` |
| `as unknown as` / `as any` / `@ts-ignore` | 9 / 0 / 0 | `grep` |
| TODO/FIXME, закомментированный код | 0 / 0 | `grep` |
| Копипаст (jscpd, ≥ 60 токенов) | 27 клонов, 287 строк (0,37 %) | `npx jscpd src --min-tokens 60` |

Самые крупные маршруты по JS (gz): `/books/[id]/cover` 291, `/books/[id]/questions` 281, `/admin/deals/[id]` 268, `/` 261, `/books/[id]/pages` 261, `/books/new` 261. Тяжёлый three.js (612 KiB) уже грузится лениво через `next/dynamic`.

## 2. Карта модулей и зависимостей

17 контекстов в `src/modules`. Самые крупные: `ordering` (2 037 строк), `production` (1 910), `messaging` (1 577), `sales` (1 491), `authoring` (1 352).

### 2.1. Кто кого импортирует

Матрица: строка импортирует столбец, в ячейке число импортов. Импорты внутри модуля не показаны.

```
from \ to       acces assis autho autom clien feedb ident marke messa notif order produ refer repor sales telep works
app                24     6     5     4     4     5     6    15    16     2    27     1     4     4    19     5    28
components          1                 1                       1                                   2     2
server              3     1     4     1     1     2     5     1     2     1     3     2     2     1     2     1     3
shared                                            1                             3                       2
m:access            ·                                   1                                                           1
m:assistant               ·                                         1                                   1           3
m:automation        1                 ·                                                                             4
m:clients           1                       ·                                                                       2
m:marketing                                                   ·                                                     1
m:messaging         2                 1                             ·                                              11
m:notifications                                   1                       ·
m:ordering                                                                      ·     2
m:reporting         2                       1                 1                                   ·
m:sales                                                       1                                         ·           2
m:telephony                                                                                                   ·     3
m:workspace         2                                         1                                                     ·
```

Слой представления (`app`, `components`, `server`) обращается к модулям так: через фасады `index.ts` — 123 раза, через `domain` — 59, через `ui` — 33. Во внутренности модуля заходит одно место: `server/container.ts → production/infrastructure/adapters.ts`, и для корня композиции это допустимо.

### 2.2. Нарушения границ (46 + 5 + 6)

Полный список: [`baseline/imports.txt`](baseline/imports.txt). Сгруппировано по причине:

| Причина | Импортов | Где |
|---|---|---|
| Модули берут функции инфраструктуры `workspace` из фасада: `getSetting`, `notify`, `staffWith`, `publish`, `listFields`, `fieldVars`, `mentionableStaff`, `smtpConfig` | 27 | `messaging` 11, `automation` 4, `assistant` 3, `telephony` 3, `sales` 2, `clients` 2, `marketing` 1, `access` 1 |
| Общий словарь лежит в чужом домене: каналы (`marketing/domain/channels`), график работы (`workspace/domain/schedule`), упоминания (`workspace/domain/mentions`), мета сделок и правил | 9 | `sales`, `reporting`, `workspace`, `assistant`, `messaging`, `clients`, `automation` |
| Подпись сотрудника `adminLabel` из `access/ui` | 5 | `automation`, `clients`, `messaging` × 2, `workspace` |
| Сценарии ходят в чужой фасад без порта | 4 | `ordering → production` (`renderGiftPdf`, динамический импорт), `notifications → feedback` (`reviewToken`), `assistant → messaging`, `access/domain → identity/domain/Login` |
| Типы прав и сегментов | 3 | `reporting → access`, `reporting → clients`, `workspace → access` |
| **Модуль → `server`/`components`** | 5 | `messaging/infrastructure/chatView.ts` и `email.ts` → `server/container` (цикл через корень композиции), `chatView.ts` → `components/admin/ChatPanel` (тип), `access/infrastructure/persistence.ts` → `server/rateLimit`, `production/.../pdf/render.tsx` → `server/cover-photos` |
| **`shared` → модули** | 6 | `shared/infrastructure/db/schema.ts` берёт типы и перечисления из доменов `ordering`, `feedback`, `sales`: общее ядро зависит от модулей |

Ещё замечания:
- `components → app` (6 импортов): `AppNav`, `AdminNav`, `ChatPanel`, `ContactActions`, `CrmWidgets` берут server actions из `src/app/**`. `components/landing/Footer.tsx` обращается к `container()` напрямую.
- `server/client-mail.ts` читает таблицу `users` через `rootDb`. Для `server/` правил линтера нет вообще.
- Действующее правило линтера разрешает модулям импорт чужого фасада, `domain` и `ui`. Динамический `import()` линтер не проверяет: это отмечено в `docs/architecture.md`, но тестом не закрыто.

## 3. Дублирование

Буквального копипаста мало (0,37 %). Основная проблема — одни и те же формулы и правила, записанные по-разному.

### 3.1. Три рендерера книги

Сравнивались `modules/production/infrastructure/pdf/interior.tsx` (PDF), `components/interior/BookPage.tsx` (HTML-страницы, миниатюры, 3D) и `components/editor/PagePreview.tsx` (превью в редакторе). В двух последних колонках указаны строки.

| Что | PDF | BookPage | PagePreview / прочие |
|---|---|---|---|
| Поле полосы `side = (marginInner + marginOuter) / 2` | 70 | 305 `sideOf` | 111; `book3d/pages.tsx:114`; `lib/book/photo-pages.ts:48` |
| Ширина полосы набора `widthMm − 2·side` (то же, что `textArea(format).w`) | 72 | 173, 370, 722 | 131 |
| Высота полосы набора `heightMm − marginTop − marginBottom` (есть `textArea().h`) | 73 | (`textArea`) | 132 |
| Перевод pt ↔ мм: 8 констант | `formats.ts: MM_TO_PT` (не используется) | 680 `PT_PER_MM` | `units.ts PT_TO_MM`, `layout.ts:284`, `cover-back.ts:127`, `photo-pages.ts:12`, `book-model.ts:121` |
| Отбивки блоков ответа: абзац 0,45, лид 1,08/1,4/0,7, цитата 1,32/1,42/0,15/0,6/1,1, список 0,3 и маркер 1,6/1,2, стихи 0,08/0,2/0,65 | 441–500 | 179–241 | — |
| Капитель: кегль 0,86, разрядка 0,07 | 437 | 156–159 | — |
| Линейка над заголовком 14·scale × 1,2 pt, отступ 6·scale | 543 | 260 | — |
| Колонтитул (top 0,36), линейка (0,62), колонцифра (`marginBottom/2 − 2`) | 127–159 | 308–344 | — |
| Начальная полоса главы: номер, название, виньетка, эпиграф, фото | 257–328 | 410–463 | — |
| Стиль подписи фото (hand / label / italic) | 332–336 | 480–485 | — |
| Ряд фото внутри ответа: рамка, поляроид, подпись | 374–434 | 605–678 `InlineRow` | 294–427 `renderRows`, **со своими числами** |
| Цвета `#E3DBD0`, `#DDD6CE`, `#3A332E`, `#FFFFFF` | 274, 415, 423 | 428, 637, 662 | 343–374 (`#ddd6ce`, `#3a332e`) |
| `hexAlpha()` | — | 349 | `CoverBack.tsx:8`, `ProofTextarea.tsx:22` |
| Разбивка колонок на страницы `(scrollWidth + gap) / (width + gap)` | — | — | `PagePreview:146`, `book3d/pages.tsx:118` |
| Порядок полос книги (титул, оборот, посвящение, оглавление, главы, галерея, финал) | 177–612 | — | `lib/book/flipbook.ts planFaces`, `layout.ts estimatePages`, `server/spreadSample.ts:52` |
| Распределение фото по главам и фото на начальной полосе | `layout.ts:217, 224` | — | `QuestionsEditor.tsx:273, 276` (копия с комментарием «Как в buildBookContent») |

`PagePreview` не использует компоненты `BookPage` для ряда фото, а рисует его сам и **с отличиями от PDF и BookPage**:
- обводка поляроида `1px`, а не `0.5 pt`;
- рамка «линия» `max(1px, 0.35·px)`, а не `1 pt`;
- тень `0 1px 2px rgba(0,0,0,.08)`, а не `.12`;
- отступ подписи `bodyPx·0.5`, а не `6 pt`;
- подпись поляроида выровнена флексом по высоте поля, а не по `bottom: padBottom·0.22`.

Если свести рендереры к одному, превью в редакторе визуально изменится. Это вопрос к вам (раздел 10).

### 3.2. Админка: формы и действия/роуты

| Что | Сколько копий | Где |
|---|---|---|
| Подписи тарифов («Электронная версия», «Твёрдая обложка», «Премиум») | 5 | `pricing/actions.ts:21`, `pricing/PricingForm.tsx:11`, `clients/new/NewClientForm.tsx:65`, `deals/[id]/PaymentsPanel.tsx:69`, тернарник в `clients/new/actions.ts:124` (и ещё `assistant/domain/prompts.ts:63` со своими формулировками) |
| Подписи доставки | 3 + `<option>` | `pricing/actions.ts:23`, `pricing/PricingForm.tsx:13`, `orders/[id]/OrderControls.tsx:112–114` |
| Предел суммы платежа 100 000 000 | 4 | `MAX_PAYMENT` (экспортирован, нигде не используется), `deals/actions.ts:39`, `clients/new/actions.ts:43`, `api/admin/deals/[id]/receipts/route.ts:26` |
| Ограничения файла чека (12 МБ, тип) | 2 | роуты payments и receipts проверяют сами, `ReceiptError` проверяет ещё раз |
| «Действующее лицо» `{ userId, name, seesAll, allTasks }` из `Staff` | 11 | роуты и действия админки |
| Перевод ошибок домена в текст | 3 своих помощника | `orderingStaffMessage`, `identityText`, `orderingErrorText`; плюс `bad()` в двух роутах и `HttpError` в остальных |
| Админские поля настроек (секрет, «из окружения», подсказка) | 3 клона по 9–14 строк | `settings/SettingsForms.tsx:145–204, 284–297, 479–487` |
| Таблицы сделок и заказов | 29 строк | `DealsTable.tsx:117–145` ↔ `OrdersTable.tsx:71–98` |
| Блок оплаты заказа и сертификата | 34 строки | `GiftPayment.tsx:44–77` ↔ `PaymentBlock.tsx:57–88` |

### 3.3. Правила и константы

- **«Заказ оплачен».** Как статус — `!["pending_payment","cancelled"].includes(status)`: `api/orders/[id]/files/[kind]/route.ts:29`, `orders/[id]/page.tsx:52`, `books/[id]/page.tsx:90`. Как `status in (paid, in_production, shipped, delivered)`: `DrizzleOrderingQueries.ts:66`. В SQL — `paid_at is not null and status <> 'cancelled'` (`marketing`, `automation`) и `status <> 'cancelled'` (`reporting`, `notifications`, `automation`). При этом `ACTIVE_ORDER_STATUSES` в домене не используется.
- **Часовой пояс магазина** задан в 13 местах. В части из них `process.env.TZ || "Asia/Almaty"`, в части — жёстко `"Asia/Almaty"` или `+05:00`: `reporting/time.ts`, `workspace/domain/schedule.ts`, `notifications/domain/lifecycle.ts`, `assistant/domain/prompts.ts`, `sales/domain/plans.ts`, `marketing/persistence.ts`, `ChatPanel.tsx`, `chats/page.tsx`, `lib/utils.ts`, SQL в `sales` и `reporting`, роут платежей.
- **Видимость книги** «владелец или сотрудник» описана трижды: `Book.isVisibleTo` (домен), `queries.visibleBook`, `queries.photoFor`.
- `customFieldTypes` объявлен и в `schema.ts`, и в домене `workspace`.

## 4. Сложность

### 4.1. Файлы > 300 строк (43)

1087 `lib/book/covers-client-photo.ts`, 1031 `components/editor/QuestionsEditor.tsx`, 1022 `shared/infrastructure/db/schema.ts`, 835 `lib/book/interiors.ts`, 794 `components/book3d/webgl/scene.ts`, 753 `components/interior/BookPage.tsx`, 714 `app/admin/settings/SettingsForms.tsx`, 697 `components/book3d/BookViewer3D.tsx`, 662 `lib/book/interior-art.ts`, 657 `lib/content/landings.ts`, 625 `lib/content/articles.ts`, 623 `modules/production/infrastructure/pdf/interior.tsx`, 559 `components/editor/PagePreview.tsx`, 534 `lib/book/covers.ts`, 529 `app/(app)/books/[id]/cover/CoverEditor.tsx`, 522 `lib/book/covers-collection.ts`, 471 `app/(app)/books/[id]/checkout/CheckoutForm.tsx`, 461 `lib/book/covers-photo.ts`, 448 `components/book3d/BookViewerGL.tsx`, 441 `app/page.tsx`, 409 `modules/production/infrastructure/pdf/render.tsx`, 394 `lib/book/layout.ts`, 372 `app/admin/settings/actions.ts`, 357 `modules/sales/application/services.ts`, 353/352 `i18n/messages/{ru,kk}/books.ts`, 348 `components/admin/ChatPanel.tsx`, 346 `lib/book/photo-pages.ts`, 338 `components/editor/PhotoInspector.tsx`, 337 `app/admin/deals/actions.ts`, 336 `app/admin/actions.ts`, 329 `lib/book/cover-back.ts`, 328 `app/admin/clients/[id]/page.tsx`, 327 `components/editor/proofread/ProofTextarea.tsx`, 320 `components/landing/SampleBook.tsx`, 317/316 `lib/content/{,kk/}love.ts`, 314 `app/admin/clients/new/NewClientForm.tsx`, 309 `app/admin/deals/DealsBoard.tsx`, 308 `app/(app)/orders/[id]/page.tsx`, 307 `modules/ordering/domain/Order.ts`, 304 `modules/messaging/application/services.ts`, 304 `modules/sales/infrastructure/persistence.ts`.

Файлы-данные можно делить механически (по шаблону, по статье, по теме): каталоги обложек и оформлений, `landings`, `articles`, `love`, словари. Файлы, где смешаны данные, логика и отрисовка, нужно делить по смыслу: `QuestionsEditor`, `BookPage`, `PagePreview`, `pdf/interior`, `scene.ts`, `BookViewer3D`, `SettingsForms`, `CheckoutForm`, `CoverEditor`.

### 4.2. Самые длинные и разветвлённые функции

| Строк | Сложность | Вложенность | Функция |
|---|---|---|---|
| 686 | 56 | 2 | `QuestionsEditor` — `components/editor/QuestionsEditor.tsx:104` |
| 563 | 20 | 3 | `InteriorDocument` — `pdf/interior.tsx:60` |
| 549 | 10 | 3 | `BookViewer3D` — `book3d/BookViewer3D.tsx:148` |
| 477 | 11 | 2 | `PagePreview` — `editor/PagePreview.tsx:82` |
| 455 | **67** | **6** | `CheckoutForm` — `books/[id]/checkout/CheckoutForm.tsx:16` |
| 388 | 11 | 2 | `HomePage` — `app/page.tsx:53` |
| 377 | 20 | 3 | `BookViewerGL` — `book3d/BookViewerGL.tsx:71` |
| 292 | 48 | 3 | `ClientPage` — `admin/clients/[id]/page.tsx:27` |
| 244 | 53 | 2 | `DealPage` — `admin/deals/[id]/page.tsx:28` |
| 210 | 40 | 2 | `OrderPage` — `(app)/orders/[id]/page.tsx:29` |
| 98 | 47 | 5 | `refineFlow` — `pdf/flow.ts:96` (решения вёрстки вперемешку с разбором раскладки react-pdf) |
| 90 | 45 | 3 | `createClientAction` — `admin/clients/new/actions.ts:73` |
| 72 | 51 | 3 | `perform` — `automation/application/AutomationEngine.ts:69` |
| 88 | 23 | **8** | колбэк `places.forEach` — `lib/book/photo-pages.ts:140` |

Распределение функций длиннее 60 строк: `app` 73, `components` 43, `modules` 11, `lib` 8, `hooks` 3, `server` 1. Со сложностью больше 15: `app` 28, `modules` 23, `components` 9, `lib` 6. Полные списки — в [`baseline/complexity.txt`](baseline/complexity.txt).

### 4.3. Имена и словарь терминов

- `lib/utils.ts` — «util без предмета». Внутри `cn`, `formatDate` (тянет оба словаря), `nowMs`.
- Один и тот же термин назван по-разному:
  - «Ответ в вёрстке» (заголовок, текст и фото): `ContentItem` в `layout.ts`, `SampleEntry` в `BookPage`, `PreviewEntry` в `PagePreview`, `it` в PDF, `EditorQuestion` в редакторе.
  - «Оформление»: `interior` — это и id в строке БД, и объект `InteriorDesign` в `BookContent`, и переменная `design`.
  - «Лист»: `Sheet` в `BookPage` означает страницу, а в `flipbook.ts` — лист из двух полос.
  - «Страница» и «полоса» смешаны.
- `info` (`PagePreview.tsx:158`, карта ответов) и `d` для сделки, перетаскивания и данных встречаются в длинных функциях.

Предлагаемый словарь: **книга** `Book`, **глава** `Chapter`, **вопрос** `Question`, **ответ в вёрстке** `Entry` (заголовок, текст, фото), **блок набора** `AnswerBlock`, **полоса** `Page`, **разворот** `Spread`, **лист** `Leaf`, **оформление** `InteriorDesign`/`design` (id — `interiorId`), **обложка** `Cover`.

## 5. Мёртвый код и неиспользуемые экспорты

Проверено `npx knip@5` (без установки в проект), полный отчёт — [`baseline/knip.txt`](baseline/knip.txt).

- **Мёртвый файл:** `src/components/BackLink.tsx`.
- Ложные срабатывания: `public/crm-sw.js` (service worker грузится по URL), `deploy/ecosystem.config.cjs` (PM2), `scripts/e2e-*.mjs` и `scripts/shot*.mjs` (запускаются вручную), `tests/server-only-stub.ts` (алиас vitest).
- **71 неиспользуемый экспорт.** Примеры:
  - `MM_TO_PT`, `SPINE_FONT_MAX_MM`;
  - функции `layout.ts`, нужные только внутри файла: `questionHeading`, `answerLines`, `headingLines`, `inlinePhotosPages`, `pluralRu`;
  - `inline-photo.ts`: `defaultInlineStyle`, `aspectRatios`, `ROW_MAX_WIDTH`, `photoRatio`, `frameExtra`, `POLAROID_*`;
  - `BookPage.tsx`: `InlineDrawing`, `faceCss`, `labelCss`, `paragraphCss`, `leadInCss`, `LeadParagraph`, `ChapterTail`, `folioText`, `TextArea`, `EntryBody` (используются внутри файла);
  - `server/scheduler.ts`: `tick`, `crmTick`, `outboxTick`;
  - `MAX_PAYMENT`, `ACTIVE_ORDER_STATUSES`, `isOrderStatus`, `AccessDeniedError`, `redisClient`, `schema`, `hmacSha1Base64`, `staffGate`, `actorLabel`, `isEditable`, `coverPhotoOriginal`, `channelLabels`, `wazzupConfigured` (фасад).
- 113 неиспользуемых экспортированных типов. Большинство — публичные типы фасадов, их можно оставить. Чистить стоит типы компонентов и инфраструктуры.
- Зависимость `playwright` нигде не импортируется (её используют только скрипты `scripts/shot*.mjs`). `@react-pdf/stylesheet` импортируется, но не указана в `package.json` (приходит транзитивно).
- TODO и закомментированного кода нет.

## 6. Пробелы в тестах

По импортам из `tests/` ([`baseline/testreach.txt`](baseline/testreach.txt)) и по содержанию тестов:

| Область | Состояние |
|---|---|
| `modules/clients` (10 файлов, все слои) | **0 тестов** |
| `modules/production/application` (`PrintFilesService`, `BookPreviewService`) | **0 тестов**: очередь, кэш, `force`, предпросмотр без водяного знака после оплаты |
| `modules/workspace/application` (`CustomFieldsService`) | только транзитивно |
| `modules/reporting` (17 read-моделей на SQL) | 0, нужна БД |
| `modules/*/infrastructure` (репозитории Drizzle) | 0, кроме outbox и выручки (интеграционные) |
| `server/access.ts`, `server/api.ts`, `server/books.ts` (права, перевод ошибок в HTTP) | **0**, критично для «доступа к чужим книгам» |
| Роуты `app/api/**` и server actions | 4 файла из 217 в `app/` |
| `components/**` и хуки | 0, в том числе `PagePreview` (перетаскивание фото) и `QuestionsEditor` (автосохранение) |
| `lib/`: `csv.ts`, `utils.ts`, `urls.ts`, `client-api.ts`, `book/photo-refs.ts` | 0 |

Что из критичных потоков уже покрыто:
- **Оформление заказа и оплата.** `ordering.test.ts` (578 строк): цены, промокоды, переходы статусов, CloudPayments. Нет теста на гонку двух оплат и на сертификат через вебхук.
- **Печатные файлы.** Рендер PDF покрыт (`pdf*.test.tsx`), сервис с очередью и кэшем — нет.
- **Вёрстка PDF.**
  - Кратность страниц и TrimBox проверяет `pdf.test.tsx`.
  - Вылеты проверены только размером страницы, без проверки «фото под обрез касается края вылета».
  - Висячие заголовки покрыты на уровне решений `refineFlow` (`pdf-flow.test.ts`), но не по готовому PDF.
- **Доступ к чужим книгам.** На уровне сервиса тесты есть (`authoring.test.ts`: чужая книга — `bookNotFound`). Веб-адаптер `viewerOf` и роуты не проверены, и дыра V1 из раздела 9 тестами не ловится.

## 7. Производительность и надёжность

1. **Редактор перерисовывается на каждый символ целиком.** Каждый символ вызывает `setQuestions`, и дальше по цепочке:
   - `QuestionsEditor` (686 строк) рендерится заново;
   - `estimatePages` пересчитывается по всей книге (useMemo зависит от `questions`, а они меняются на каждом символе);
   - `previewChapters` собирается заново;
   - `PagePreview` без `memo` пересчитывает `answerBlocks` для всех ответов;
   - строится `liveKey` — `JSON.stringify` стиля каждого фото всей книги;
   - React сверяет **невидимую копию всех глав** для замера и запускает `measure()`.

   Объём работы растёт с размером книги, а не с размером правки.
2. **В браузер на каждой странице уходят оба словаря целиком**, вместе с письмами (`mail`), юридическими текстами (`legal`) и ошибками API. Их тянут `lib/utils.ts` (`formatDate` → `messagesFor`), `lib/client-api.ts` и `i18n/client.tsx`. Базовый чанк `0-huy0aqnjh_2.js` весит 250 KiB (68 KiB gz) и содержит, например, «Публичная оферта» и 34 темы писем. Разница между `/_not-found` и `/_global-error` — 87 KiB gz.
3. **Утечки.**
   - В 3D-просмотрщике геометрия корешка (`scene.ts:233`) не попадает в `track()` и не освобождается. Обработчик `wheel` (`scene.ts:194`) не снимается. После `forceContextLoss()` видеопамять освобождается, так что последствия мелкие.
   - Кэш `useCoverImage` (`book3d/useCoverImage.ts:5`) хранит data-URL фото обложек без предела. Каждое — сотни КБ, и при листании шаблонов в редакторе обложки память растёт.
   - На сервере `/api/covers` держит в памяти процесса `Map` всех отданных фонов без предела (`api/covers/[file]/route.ts:22`). При сотне шаблонов × 2 формата × 6 вариантов это сотни мегабайт.
4. **N+1** (`node scripts/refactor/nplus1.mjs`, находки проверены вручную):
   - `bulkDealsAction` вызывает `findById` в цикле по выбранным сделкам (`deals/actions.ts:302`);
   - статус кодов приглашений — `findByCode` на каждый код (`server/container.ts`, `referrals.status`);
   - `saveSettings` делает upsert по одному ключу и вне транзакции (`workspace/infrastructure/settings.ts:164`);
   - `funnel.orderCancelled` загружает сделки в цикле, это нормально, сделок 1–2.

   Страницы админки грузят данные через read-модели `reporting` одним-двумя запросами, явных N+1 там не найдено.
5. **Ленивая загрузка.** three.js и CSS-3D подключены через `next/dynamic`. Каталог обложек (`covers-client-photo`, `covers-collection`, `covers-photo` — около 45 KiB gz) уходит целиком в маршруты обложки, страниц и главной.
6. **Ошибки.** Обработка неединообразна:
   - `api()` переводит `HttpError`, `DomainError`, `ZodError` и `SyntaxError`, но не `ForbiddenError`;
   - server actions возвращают русские строки или бросают `ForbiddenError`, и клиент видит общую ошибку Next;
   - два роута отдают `{ error }` своей функцией `bad()`;
   - в трёх местах `instanceof` для доменных ошибок (`PaymentError`, `ReceiptError`, `WazzupError`), хотя `docs/architecture.md` требует `XError.is()`.
7. **Побочные эффекты при рендере.** `CatalogSync` и `ensureCatalog()` меняют глобальный каталог цен прямо во время рендера. Это работает (значения одинаковые), но скрыто зависит от порядка.

## 8. Безопасность и права

- **Проверки прав.**
  - 126 экспортированных server actions. У 123 есть `assertStaff`, `requireUser` или `rateLimit`. Без проверок: `logoutAction` (так и задумано), `resetAction` (защищён токеном из письма), `claimGiftPaymentAction` (защищён секретным токеном сертификата, лимита частоты нет).
  - 45 роутов: все `api/admin/*` через `apiStaff`, книжные — через `apiBook`/`apiViewer` с проверкой владельца в сервисе, вебхуки — через токен или HMAC в `safeEqual`/`timingSafeEqual`.
  - **Дыра V1:** «сотрудник» для клиентских книг определяется без учёта его прав и ограничений безопасности.
- **zod.** 38 из 126 действий не валидируют вход через zod. Чаще это аргументы-id без проверки и ручной разбор `FormData` регулярками: `saveAiAction`, `savePricingAction`, роуты платежей и чеков. `/api/locale` разбирает JSON вручную.
- **Секреты.** В браузер уходят только замаскированными (`maskSecret`). Адреса вебхуков с токеном видят только сотрудники с `settings.manage`, так задумано. В логах секретов не найдено.
- **Лимиты частоты.**
  - Есть: вход, регистрация, «забыли пароль», 2FA, промокод, сертификат, загрузка фото, AI-корректор, орфография, письма близких, отзывы, чат на сайте, «перезвоните».
  - Нет: `aiNextStepTaskAction` (не вызывает AI, не критично), `claimGiftPaymentAction`.
  - Ключ по IP подделывается (V2).
- **CSRF.** Изменяющие роуты вызывают `checkOrigin`. `/api/locale` его не вызывает, но последствия — только смена языка жертве.

## 9. Найденные баги и уязвимости

Нумерация сквозная, чтобы ссылаться из плана. «Видит клиент» — изменит ли исправление то, что видит клиент (тогда исправление только после вашего «да»).

### Уязвимости

**V1. Любой сотрудник читает и меняет любую книгу клиента в обход своей роли, белого списка IP и обязательной 2FA.** Высокая.
- Где: `server/books.ts:viewerOf` → `server/auth.ts:isStaff` (`role === "admin" && !staffDisabled`) → `queries.visibleBook`, `queries.photoFor`, `Book.isVisibleTo`.
- Почему: права роли (`clients.view`) и `staffGate` (IP, 2FA) проверяются только в `getStaff()`. Клиентские страницы `/books/[id]/*` и API `/api/books/*`, `/api/photos/*` ими не пользуются.
- Воспроизведение:
  1. Включите в «Безопасности» вход только из офисной сети.
  2. Заведите роль без «Видеть клиентов и их книги» и сотрудника с ней.
  3. Войдите им из другой сети: `/admin` отправит на `/admin-denied`.
  4. Откройте `/books/<id книги клиента>/questions`: книга откроется.
  5. `PATCH /api/books/<id>/questions/<qid>` с `{"answer":"…"}` изменит ответ.
- Исправление: `viewerOf` строится от `getStaff()` с правом `clients.view` (а для изменения — `clients.edit`). Сотрудник без права получит 404. Видит клиент: нет, видит сотрудник.

**V2. Лимиты частоты по IP обходятся подделкой `X-Forwarded-For`.** Средняя.
- Где: `server/rateLimit.ts:clientIp` берёт **первый** адрес из `X-Forwarded-For`. `deploy/nginx-mybook.conf` использует `$proxy_add_x_forwarded_for` (дописывает), поэтому первый адрес задаёт клиент. Рядом уже есть правильный `trustedClientIp()`.
- Последствия: перебор кодов сертификатов (`/redeem`), промокодов (`checkPromoAction`), спам писем «забыли пароль», регистраций, писем близких и отзывов.
- Воспроизведение: `for i in $(seq 100); do curl -H "X-Forwarded-For: 1.2.3.$i" …; done` — лимит не срабатывает.
- Исправление: `clientIp()` = `trustedClientIp()`. Видит клиент: нет.

**V-minor.**
- `/api/locale` без `checkOrigin` (CSRF, меняет только язык).
- `claimGiftPaymentAction` без лимита и без zod.

### Баги

**B1. Версия рисунков обложек (`COVER_ART_VERSION`) не следит за частью их кода.**
- Где: `next.config.ts` хеширует 7 файлов, а `covers.ts` транзитивно зависит ещё от `covers-client-photo.ts`, `cover-registry.ts`, `photo-frame.ts`.
- Последствия: после правки обложек на фото клиента браузеры и CDN продолжают показывать старые фоны. Ответы отдаются `immutable`, а адрес не меняется.
- Воспроизведение: поменять цвет в `covers-client-photo.ts`, пересобрать — `COVER_ART_VERSION` прежний.
- Видит клиент: да, после исправления фоны один раз скачаются заново.

**B2. 3D-книга раскладывает полосы не так, как PDF.**
- `flipbook.ts:planFaces` ставит начальную полосу главы всегда справа, вставляя пустую. В PDF главы идут подряд, и глава может начаться слева.
- 3D показывает пустой оборот титула, а в PDF там копирайт (`interior.tsx:198`).
- Воспроизведение: титул (1), оборот (2), посвящение (3), оглавление (4), глава 1 (5) с текстом на 2 полосы (6–7). В PDF глава 2 начнётся на полосе 8 (слева), в 3D — на 9, а 8 будет пустой. Номера в оглавлении 3D и PDF разойдутся.
- Видит клиент: да. Решение за вами: какой вариант правильный, а какой привести к нему.

**B3. Оценка страниц в редакторе не совпадает с книгой.**
- `QuestionsEditor.tsx:pages` пропускает вопросы без текста, но с фото: `buildBookContent` их печатает.
- Оценка не учитывает главу писем близких.
- Воспроизведение: вставить фото в пустой ответ — счётчик страниц не меняется, а в PDF появляется полоса.
- Видит клиент: да (число страниц и цена печати).

**B4. Платёж без чека.**
- `api/admin/deals/[id]/payments/route.ts` сначала создаёт платёж, потом сохраняет чек, без транзакции.
- Если сохранить файл не удалось, платёж остаётся без чека, вопреки правилу «платёж без чека не принимается». Менеджер повторяет попытку, и платёж задваивается.
- Видит клиент: нет, видит менеджер. Выручка двоится.

**B5. `checkOrigin` падает 500 на `Origin: null`.** Песочные iframe и часть приватных режимов шлют такой заголовок, а `new URL("null")` бросает `TypeError`. Видит клиент: нет.

**B6. Гонки в платежах по сделке.** `DealPayments.add` определяет «предоплату» подсчётом перед вставкой, `refund` сверяет сумму возврата с принятым — всё без блокировки. Два одновременных запроса дадут две «предоплаты» или возврат больше принятого. Видит клиент: нет.

**B7. `saveSettings` не атомарен.** Удаление пустых ключей и upsert по одному идут вне транзакции, и при ошибке настройки сохранятся частично. Видит клиент: нет.

### Найдено при страховочной сетке (фаза 3)

Каждый случай закреплён тестом с пометкой «баг:» или «так сейчас», чтобы исправление было видно.

**B8. Книга не собирается: pdfkit «unsupported number: Infinity».** Высокая.
- Когда: ответ без заголовка (`hideHeading`) идёт сразу за длинным ответом, а разделитель-рисунок (глиф или линейка 18×0,6 pt) попадает на границу полосы. react-pdf оставляет на полосе кусок `<Svg>` нулевой высоты, и `resolveAspectRatio` делит на ноль.
- Последствия: такую книгу нельзя собрать ни в печать, ни в превью, ни в электронную версию. В первой версии набора упали 19 из 46 книг A5 — все в оформлениях с разделителем-рисунком.
- Тест: `tests/fixtures.test.ts` (photobook-a5-ru, вопрос 11 без заголовка).
- Видит клиент: да — книга перестаёт падать. Исправляется сразу, отдельным коммитом.

**B9. В квадратном формате на фотостранице «под обрез» нет водяного знака превью.** react-pdf пишет «Node of type IMAGE can't wrap between pages…», переносит fixed-знак на следующую полосу и отбрасывает её. В A5 знак на месте. Тест: `tests/fixtures.test.ts` (classic-square-ru, полосы 10 и 26). Видит клиент: да, в превью до оплаты. Исправляется вместе с B8.

**B10. Ошибки API: регистр и параметры.** `domainStatus` ищет `NotFound$` с учётом регистра, поэтому `OrderingError("notFound")` (промокод не найден) даёт 400, а не 404. `api()` не передаёт параметры в тексты ошибок домена (`photosLimit` дал бы «до undefined фото»; сейчас роут ловит ошибку сам). Тесты: `tests/server-adapters.test.ts`. Исправляется в E4.

**B11. Сотрудник видит машинные коды вместо текста.** `team/actions` `run` возвращает код `IdentityError` (у неё нет `message`), например «email». `orderingStaffMessage` для `OrderingError` без `message` отдаёт «notPayable». `orThrow` превращает `AccessError` в простой `Error`. Ошибка формы в `updateOrderAction` — английский текст zod. Код `twoFactorCode` показывается двумя разными текстами (`fail` и `confirmTwoFactorAction`), прочие `IdentityError` `fail` не ловит. Тесты: `tests/server-adapters-actions.test.ts`. Исправляется в E4 (`actionError`).

**B12. Мелочи сервисов clients и production.**
- `NotesService.add` без клиента, заказа и сделки строит ссылку `/admin/clients/undefined` (сейчас вызывающий код всегда передаёт клиента).
- `TasksService.create` не сверяет исполнителя со справочником: задачу можно поставить отключённому сотруднику, ему уйдёт уведомление (`setManager` проверяет).
- `warmUp` возвращает `null` и при кэше, и при ошибке: если упала читательская версия, параметры печати теряются.
- Подпись упоминания у заметки к заказу — «заметка о клиенте», хотя ссылка ведёт на заказ.
- `fieldKey` не транслитерирует ь и ъ («Подъезд» → `pod_ezd`), `selectOptions` сравнивает повторы с учётом регистра.
- Тесты: `tests/clients.test.ts`, `tests/production.test.ts`, `tests/workspace.test.ts`. Видит клиент: нет.

**B13. CloudPayments молча принимает повторную оплату.** Повторный `pay` с другим `TransactionId` по уже оплаченному заказу даёт ответ 0, в журнале ничего. У Kaspi в таком случае появляется заметка «нужен возврат». Тест: `tests/cloudpayments.test.ts`. Видит клиент: нет, видит сотрудник (деньги пришли дважды).

**B14. Оценка в квадрате больше PDF на полосу.** В A5 оценка `estimatePages` совпала с PDF у всех оформлений; в квадрате (classic-square-ru/kk) оценка даёт главе 2 три полосы текста, в PDF их две. Тест «так сейчас»: `tests/characterization/render.test.ts`. Входит в B3/C7.

**Наблюдения (не баги):** `contentFingerprint` учитывает подпись фото обложки, которого внутри книги нет (лишний промах кэша); отпечаток зависит от года печати — 1 января кэши превью пересобираются; `buildBookContent` сортирует вопросы по `position`, а фото берёт в порядке массива; граф импортов на регулярке терял побочные импорты и `import()` после `export` (нарушения не пропущены — сверено по AST; переход на AST — в фазе 3).

## 10. Соответствие критериям «готово» и что упирается в поведение

| Критерий | Сейчас | Достижимо без изменения поведения? |
|---|---|---|
| tsc, eslint, vitest, build без ошибок | ✅ | да |
| Ноль прямых импортов между модулями | 46 + 11 | да: порты, общий словарь в `shared/domain`, правило линтера и тест графа импортов |
| Тонкий `app/` | нет: сценарии в действиях и роутах | да: перенос в сервисы приложения 1:1. Транзакция платежа с чеком — это исправление B4, нужно ваше «да» |
| Домен без БД, сети, Next и React | ✅ по линтеру. Мелочи: `process.env.TZ` в `sales/domain/plans.ts`, `new Date()` по умолчанию в разборе протоколов | да |
| Инфраструктура без правил | нет: `sales/infrastructure/payments.ts`, решения `refineFlow`, `sendBlocker` | да |
| Одно место для формул, особенно в трёх рендерерах | нет | **частично**. Числа PDF и `BookPage` сводятся без изменений. Ряд фото в `PagePreview` отличается видом (§3.1): одно место — только если превью станет как PDF. Варианты: (а) свести и согласовать изменение вида превью; (б) общий код с явными параметрами превью |
| Файлы до 300 строк, функции до 60 | 43 / 139 | да. Исключения с обоснованием: каталоги-данные (`landings`, `articles`, словари), где деление ничего не даёт |
| Нет мёртвого кода и неиспользуемых экспортов | 1 файл, 71 экспорт | да |
| Юнит-тесты `lib`, `domain`; тесты `application` каждого модуля с фейками | нет у `clients`, `production`, `workspace` | да |
| Критичные потоки покрыты | частично (§6) | да |
| Нет N+1, лишних ре-рендеров, утечек | нет (§7) | да. Ограничение памяти кэшей меняет только память |
| Тяжёлое лениво, бандлы не выросли | ✅ / резерв −20…−30 KiB gz на каждой странице за счёт словарей | да |
| Ошибки единообразно → `HttpError` с ключом словаря | нет | **частично**. `ForbiddenError` в API сейчас даёт 500, станет 403. Server actions админки отдают русские строки: перевод в словарь — это новые ключи, но тексты те же |
| Права в каждом роуте и действии | нет (V1) | **нет**: закрыть V1 = изменить, что видит сотрудник. Нужно ваше «да» |
| Всё через zod | 38 действий без zod | да для корректного ввода. Для некорректного меняется только тип ошибки (500 → 400). Считаю изменением и спрашиваю |
| Секреты не в логах и не в клиенте | ✅ | — |
| Лимиты там, где есть стоимость | есть, но обходятся (V2) | **нет**: закрыть V2 = изменить поведение для подделывающих |

## Как перепроверить

```bash
node scripts/refactor/imports.mjs          # границы модулей
node scripts/refactor/complexity.mjs       # размеры файлов и функций
npx next build && node scripts/refactor/bundles.mjs --compare docs/refactor/baseline/bundles.json
node scripts/refactor/actions.mjs          # права и zod в server actions
node scripts/refactor/testreach.mjs        # что не достают тесты
node scripts/refactor/nplus1.mjs           # кандидаты N+1
npx --yes knip@5 --reporter compact        # мёртвый код
npx --yes jscpd@4 src --min-tokens 60      # копипаст
```
