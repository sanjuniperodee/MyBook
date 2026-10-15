# Оставшиеся шаги фазы 4 — задания

Тексты заданий для исполнителей (как их давал оркестратор). Порядок: дорожка вёрстки V4 → V5 → V6 → V7 → V8 → F2, дорожка приложения E5 → E1 → E6 → D5 → F4. Дорожки независимы. После всех — фаза 5 (отчёт).

## V4 — Вёрстка: одна сборка содержимого и оценка объёма (C7, B3, B14)

Ветка: `refactor/p4-v4-one-content`

C7 по плану.
1) Первым коммитом без изменения поведения: экспортировать из src маппинг глав (сейчас продублирован в app/(app)/books/[id]/questions/page.tsx, QuestionsEditor и scripts/visual/html-data.ts) в lib/book (одна функция) и перевести на неё всех, включая стенд html-data.ts. check.sh START --quick → 0.
2) Оценка объёма в редакторе (QuestionsEditor useMemo pages — копия расчёта в tests/characterization/editor-estimate.test.ts) строится той же функцией, что buildBookContent/estimatePages (src/lib/book/layout.ts). Сначала — вынести текущий расчёт редактора в lib как чистую функцию, повторяющую снимок editor-estimate дословно (тест переводится на неё, копия удаляется). Вторым коммитом «Исправление: B3/B14 …» — редактор считает через buildBookContent+estimatePages (вопросы с фото без текста, глава писем, распределение фото — как в книге); снимок editor-estimate обновляется, в сообщении коммита и notes — таблица отличий до/после по книгам набора. Третьим коммитом «Исправление: B14» — estimatePages в квадрате совпадает с PDF (classic-square-ru/kk: глава 2 — 3 полосы в оценке против 2 в PDF; найди причину в оценке строк/высоты в квадрате) — tests/characterization/render.test.ts «так сейчас» переворачивается: оценка = факт для всех книг набора, где известен факт; если для какой-то книги совпасть нельзя без переписывания — объясни.
Вид PDF не меняется (check.sh START полный PDF → 0).

## V5 — Вёрстка: превью редактора на общих компонентах (C6, решение 3 — вариант а)

Ветка: `refactor/p4-v5-preview`

C6 по плану, вариант (а): превью в редакторе (components/editor/PagePreview.tsx, ~560 строк) рисует ряд фото и ответ компонентами из components/interior (те же, что HTML-полосы BookPage и как PDF), а интерактивный слой (перетаскивание фото, выделение, клики) — поверх. Разбивка колонок на полосы ((scrollWidth + gap) / (width + gap)) — один общий хелпер для PagePreview и components/book3d/pages.tsx. PagePreview → components/editor/preview/* (файлы ≤ ~300 строк).
Это согласованное изменение вида превью: отличия ожидаются только в видах html:preview:* и только в ряду фото (обводка поляроида 0,5 pt вместо 1px, рамка-линия 1 pt, тень .12, отступ подписи 6 pt, положение подписи поляроида — как в PDF/BookPage). check.sh START: PDF → 0 отличий; html:chapter/front/toc/photos/flipbook/back → 0; html:preview — перечисли отличающиеся ключи и посмотри диффы глазами (Read PNG), опиши в behaviorChanges. Перетаскивание и выделение фото в превью работают как раньше — проверь e2e scripts/e2e-inline-photo.mjs, если запускается без БД; иначе — юнит-тестом логики вставки/перестановки и ручной проверкой через стенд.

## V6 — Редактор: QuestionsEditor по смыслу и без лишних перерисовок (D1, F1)

Ветка: `refactor/p4-v6-editor`

D1. components/editor/QuestionsEditor.tsx (~1030 строк, функция 686 строк, сложность 56): хуки useQuestionsDraft (состояние, автосохранение, черновик), usePageEstimate, useInlinePhotos; компоненты QuestionNav, AnswerPanel, PhotoStrip, PreviewPane, Toolbar (имена уточни по коду). Поведение то же: автосохранение (таймеры, порядок запросов), черновик, диктовка, вставка фото.
F1. Редактор не перерисовывает книгу на каждый символ: главы превью — memo-компоненты с ключом по содержимому главы; оценка и превью через useDeferredValue; liveKey по главам вместо JSON.stringify всей книги; замер — только у изменённой главы. Замер до/после: React Profiler на стенде S4 (scripts/visual — добавь сценарий «ввод 50 символов в ответ» с подсчётом коммитов и времени рендера; или через React.Profiler в стенде) — числа в notes и отчёт для docs/refactor/report.md.
Проверки: tsc/eslint/vitest; check.sh START → 0 отличий во всех видах; e2e scripts/e2e-dictation.mjs и e2e-inline-photo.mjs — если требуют БД/сервер и не запускаются, напиши; тогда добавь юнит-тесты для useQuestionsDraft (автосохранение с фейковыми таймерами и fetch).

## V7 — Каталоги обложек и оформлений по файлам, версия обложек, ленивые обложки (D2, D3, F3, B1)

Ветка: `refactor/p4-v7-covers-interiors`

D2. lib/book/covers-client-photo.ts (~1090), covers-collection.ts, covers-photo.ts, covers.ts → src/lib/book/covers/<семья>/<шаблон>.ts + общий svg-kit.ts (из cover-kit.ts) ; порядок и реестр — в индексе (cover-registry). SVG каждого шаблона байт-в-байт тот же: tests/characterization/covers.test.ts без правок снимков. Исправление B1 отдельным коммитом: COVER_ART_VERSION в next.config.ts хеширует ВСЕ файлы src/lib/book/covers/** (и то, от чего они зависят: photo-frame.ts, cover-registry.ts — проверь граф импортов), версия один раз изменится — это ожидаемо, отметь.
D3. lib/book/interiors.ts (~835) → lib/book/interiors/{types,legacy,collection/*,typesetting?}.ts; lib/book/interior-art.ts (~660) → lib/book/interior-art/{glyphs,frames,opener-art,geometry}.ts. Порядок interiorDesigns тот же.
F3. Каталог обложек грузится лениво там, где показывается выбор (страница обложки, страниц, главная): dynamic import шаблонов/реестра, чтобы ~45 KiB gz не уходили в маршруты целиком; `node scripts/refactor/bundles.mjs --compare docs/refactor/baseline/bundles.json` — до/после в notes (бандлы не растут, целевые маршруты уменьшаются).
check.sh START: PDF и HTML → 0 отличий; next build.

## V8 — 3D-просмотр по смыслу, утечки, 3D повторяет PDF, LAYOUT_VERSION (D4, F5, B2, C8)

Ветка: `refactor/p4-v8-3d`

D4. components/book3d/webgl/scene.ts (~790), BookViewer3D.tsx (~700), BookViewerGL.tsx (~450) → webgl/{materials,textures,geometry,BookScene}.ts; общие хуки useFullscreen, useBookKeys (сейчас 15 строк копии в двух вьюерах). Тесты tests/flipbook.test.ts, tests/page-curl.test.ts зелёные.
F5. Утечки: track() для геометрии корешка (scene.ts ~233) и снятие обработчика wheel (~194); LRU-предел у кэша useCoverImage (book3d/useCoverImage.ts) и у Map отданных фонов в app/api/covers/[file]/route.ts (разумный предел, например 200 записей; объясни выбор). Юнит-тест LRU.
B2 (решение 4: правильный PDF, 3D повторяет PDF) — отдельным коммитом «Исправление: …»: planFaces (lib/book/flipbook.ts) не ставит пустую полосу перед главой — главы идут подряд, как в PDF; оборот титула в 3D — копирайт, как в PDF (interior.tsx колофон). Снимок planFaces в tests/characterization обновляется — в notes таблица отличий; html:flipbook отличается — перечисли; PDF → 0 отличий. Номера в оглавлении 3D и PDF совпадают — тест.
C8. LAYOUT_VERSION (pdf/render.tsx): если за всю фазу 4 вывод PDF не изменился (check.sh против ae97242 полный PDF → 0; B8/B9 уже подняли версию до 4), версия не трогается; иначе — увеличить и обосновать.

## F2 — Словари в клиенте (F2)

Ветка: `refactor/p4-f2-dictionaries`

F2. В браузер на каждой странице уходят оба словаря целиком, с письмами (mail), юридическими текстами (legal) и ошибками API (audit §7.2: базовый чанк 250 KiB / 68 KiB gz). Серверные пространства (mail, legal, …) — только на сервере; клиент получает словарь текущего языка без второго (i18n/client.tsx, lib/client-api.ts, lib/dates.ts formatDate). Тексты на страницах те же на ru и kk (проверь e2e scripts/e2e-kk.mjs, если запускается, иначе снимки HTML стенда для kk и тест i18n). Замер: `node scripts/refactor/bundles.mjs --compare docs/refactor/baseline/bundles.json` — цель −20…−30 KiB gz на каждой странице; числа в notes. next build.

## E5 — zod на все входы (E5, решение 7, V-minor)

Ветка: `refactor/p4-e5-zod`

E5: схемы zod для всех аргументов server actions (id, FormData) и тел роутов, где их нет (38 из 126 действий по аудиту §8: saveAiAction, savePricingAction, роуты платежей и чеков, /api/locale и т.д.). Свежий список — `node scripts/refactor/actions.mjs` (цель: «без zod» — 0, кроме действий без входа). Мусор вместо id → 400/понятная ошибка вместо 500 (решение 7 — это согласованное изменение, перечисли). Тексты ошибок для корректного ввода — прежние. Схемы рядом с действиями или в ui модуля, без дублей (общие: uuid, phone, money — один раз).
V-minor: /api/locale — checkOrigin; claimGiftPaymentAction — лимит частоты и zod (отдельный коммит «Исправление: …»).
Тест: tests/actions-zod.test.ts — статическая проверка (как actions.mjs), что каждое экспортированное действие с аргументами валидирует вход.

## E1 — Тонкий app/: сценарии в сервисы (E1, E2, E3, B4)

Ветка: `refactor/p4-e1-thin-app`

E1. createClientAction (admin/clients/new/actions.ts, ~90 строк, сложность 45) → ClientOnboardingService в modules/clients/application с портами к identity, sales, clients (через container); действие только разбирает форму (zod) и возвращает ответ. Тексты заметок и задач те же. Характеристический тест на фейках: какие команды и в каком порядке.
E2. Принять платёж с чеком (api/admin/deals/[id]/payments/route.ts) → sales.payments.acceptWithReceipt (платёж, чек, заметка, письмо, аудит); роут — разбор multipart. Исправление B4 отдельным коммитом: платёж и чек атомарно (файл сохраняется до записи платежа; при ошибке записи файл удаляется; без транзакции «платёж без чека» невозможен) — тест.
E3. Доступ к файлам заказа → домен: canDownloadFile(order, plan, kind, staff) в ordering; роут api/orders/[id]/files/[kind] — разбор и ответ. tests/foreign-access.test.ts зелёный.
Другие толстые места app/ из `node scripts/refactor/complexity.mjs` (функции > 60 строк или сложность > 15 в app/**/actions.ts и api/**) — вынеси логику в сервисы модулей тем же приёмом, если это сценарий, а не разметка.

## E6 — Права: V1 и V2 (E6, решения 1–2)

Ветка: `refactor/p4-e6-access`

Исправление V1 (решение 1) отдельным коммитом: viewerOf (server/books.ts) строится от getStaff() с правом clients.view (для изменения — clients.edit) и проходит staffGate (IP-allowlist, 2FA); сотрудник без права — 404 на клиентских книгах, фото, страницах /books/[id]/*, API /api/books/*, /api/photos/*. Страница заказа клиента (app/(app)/orders/[id]/page.tsx) и файлы заказа — тоже через права CRM (orders.view или как называется право). Все тесты с маркером «V1:» (tests/server-adapters-access.test.ts, tests/foreign-access.test.ts) переворачиваются на новое поведение; добавь недостающие случаи.
Исправление V2 (решение 2) отдельным коммитом: clientIp() = trustedClientIp() (server/rateLimit.ts) во всех 11 местах; тесты «V2:» переворачиваются.
Проверь, что сотрудник с правами по-прежнему работает со всем (тесты на позитивный путь).

## D5 — Админка и оформление заказа по смыслу (D5, D6, D7, D8)

Ветка: `refactor/p4-d5-admin-forms`

D5. app/admin/settings/SettingsForms.tsx (~714) и settings/actions.ts (~372): по форме на интеграцию (как уже сделано для kaspi/ и whatsapp/), общие SecretField, EnvLockedField (3 клона по 9–14 строк), Copyable (дубль в KaspiForm); zod-схемы рядом с действиями. Скриншоты admin до/после: scripts/shot-admin.mjs, если запускается без БД; иначе — снимки HTML форм на стенде (scripts/visual) или ручная проверка разметки.
D6. CheckoutForm (app/(app)/books/[id]/checkout/CheckoutForm.tsx, ~470, сложность 67, вложенность 6): расчёт суммы — из ordering/ui (как на сервере, одна функция; тест, что клиент и сервер считают одинаково), секции: тариф, доставка, адрес, промокод, итог.
D7. Страницы админки со сложностью > 40 (admin/deals/[id], admin/clients/[id], admin/orders/[id], клиентский (app)/orders/[id]): модель экрана строится в modules/reporting (одна функция — один экран), страница раскладывает секции; блок оплаты заказа и сертификата (GiftPayment/PaymentBlock — 34 строки дубля) и таблицы сделок/заказов (DealsTable/OrdersTable — 29 строк) — общие компоненты.
D8. Каталоги-данные (lib/content/landings.ts, articles.ts, love.ts, словари i18n/messages/*/books.ts) — по странице/статье на файл, только если это не мешает поиску текстов; иначе оставить с обоснованием в notes.
Тексты и разметка те же; next build.

## F4 — N+1 и оставшиеся баги (F4, B6, B7, B12, B13)

Ветка: `refactor/p4-f4-nplus1-bugs`

F4. N+1: bulkDealsAction — findByIds вместо findById в цикле (deals/actions.ts); статус кодов приглашений — findByCodes (referrals); `node scripts/refactor/nplus1.mjs` — новых находок нет.
Исправления отдельными коммитами, каждое с тестом (тесты «баг:»/«так сейчас» переворачиваются):
- B7: saveSettings — одним запросом в транзакции (workspace/infrastructure/settings.ts);
- B6: блокировка в платежах по сделке (DealPayments.add — «предоплата» и refund сверяет сумму возврата) — SELECT … FOR UPDATE по сделке в UnitOfWork;
- B12: NotesService.add без клиента/заказа/сделки — без ссылки /admin/clients/undefined; TasksService.create сверяет исполнителя со справочником (как setManager); warmUp отличает «из кэша» от ошибки и не теряет параметры печати; подпись упоминания у заметки к заказу — «заметка к заказу» (новый текст в словаре ru/kk); fieldKey транслитерирует ь/ъ? — НЕТ: ключи своих полей уже сохранены в БД, смена транслитерации поменяет ключи новых полей несовместимо с похожими старыми — оставь как есть, только задокументируй; selectOptions — повторы без учёта регистра;
- B13: CloudPayments — повторный pay с другим TransactionId по уже оплаченному заказу: заметка «нужен возврат», как у Kaspi (тот же текст/механизм — одно место).
Интеграционные тесты с БД (B6, B7) — если БД нет, юнит-тест на уровне UnitOfWork-фейка + интеграционный тест (пропускается без INTEGRATION=1).
