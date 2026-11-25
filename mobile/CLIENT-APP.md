# Клиентское приложение «MyBooks» и CRM — одна кодовая база (24.11.2026)

## Решение: два приложения (flavors), не один вход с режимами

| | CRM (`crm`) | Клиент (`client`) |
|---|---|---|
| Кто | сотрудники | авторы книг |
| Вход в код | `lib/main.dart` | `lib/main_client.dart`, экраны в `lib/client/` |
| Android | `kz.mybooks.mybooks_seller`, «MyBooks CRM», APK из CRM | `kz.mybooks.app`, «MyBooks», Google Play |
| iOS | `kz.workdesk.mobile`, конфигурации Debug/Release/Profile (схема Runner), Ad Hoc через ILM-HUB | `kz.mybooks.app`, конфигурации `*-client` (схема `client`), App Store |
| Дизайн | `html.crm` (холодная палитра, системный шрифт) | кабинет сайта: тёплая бумага, Onest, текст книги — Cormorant (`AppColors.paper`, `buildTheme(client: true)`) |

Почему так, а не режим по роли в одном приложении:
- App Store не пропускает в публичный магазин приложения для внутреннего пользования (вход только для сотрудников —
  отказ по 2.1/3.2), а CRM уже раздаётся Ad Hoc; клиентам нужен обычный магазин.
- В публичной сборке нет кода и экранов CRM: меньше размер и поверхность атаки, отдельные версии и выпуски.
- Общее — `lib/core` (API, кэш, push), `lib/ui` (кит, токены).

Сборка:

```
flutter run --flavor client -t lib/main_client.dart                       # клиент
flutter run --flavor client -t lib/main_client.dart --dart-define=CLIENT_FIXTURES=true   # клиент на фикстуре (только debug)
flutter run                                                                # CRM на iOS (схема Runner)
flutter build apk --release --flavor crm                                   # CRM APK (scripts/mobile/upload-apk.sh)
flutter build apk --release --flavor client -t lib/main_client.dart        # клиент для Google Play (нужен .aab — appbundle)
```

## Данные

Экраны знают только `ClientBackend` (`lib/client/data/backend.dart`):
- контракт API v1 (ADR 0012, `packages/contracts` → сгенерированный `lib/api/mybook_api.g.dart`, процесс mybook-api):
  вход клиента, «кто я», мои книги, модель редактора, автосохранение ответа. Сотрудника клиентское приложение не пускает;
- загрузка фото — пока маршрутом кабинета `POST /api/books/{id}/photos` (Bearer работает), картинки — `/api/photos/{id}`;
  в контракте нет фото книги в модели редактора и загрузки — попросили сессию «Ресурсы»;
- офлайн: полка и книга — в `LocalCache` (папка на пользователя), несохранённые ответы — очередь в кэше книги, уходят,
  когда появится сеть.

Проверка с сервером локально: `DATABASE_URL=…/mybook_visual` → `scripts/migrate.ts` и `scripts/visual/seed.ts`;
`node scripts/build-api.mjs` (нужна папка `.next/standalone`) и `node .next/standalone/api.mjs` с `API_PORT`; `next dev` с тем
же `API_PORT` (переписывает `/api/v1`); приложение — `--dart-define=SERVER_URL=http://localhost:<порт next>`.

Тестовый автор — из сида `scripts/visual/seed.ts` (база `mybook_visual`), не настоящие клиенты.

## Экраны = сайт (решение владельца 24.11: только нативно, один в один с кабинетом)

Модели экранов считает сервер теми же функциями, что страницы сайта: полка — `src/server/shelf.ts` (cabinetShelf),
штаб книги — `src/server/book-hub.ts` (cabinetBook); обложка — картинкой той же, что в печати
(`/api/books/<id>/cover-image`). Анимации сайта — `lib/client/ui/motion.dart`: Book3D и «книга открывается»
(OpenBookLink) → страница вырастает в лист редактора (LeafRoute, старт после первого кадра), обложка-Hero, bar-grow,
PageFade (CabinetRoute со свайпом «назад» от края), PageTurn (листание вопросов), .enter. Проверять анимации записью
симулятора: `xcrun simctl io <udid> recordVideo` + кадры ffmpeg — в отладочной сборке первый кадр экрана медленный.

## Выпуски

1. **v1 — «написать ответ и загрузить фото»:** вход, мои книги, книга (главы, ход работы), ответ с автосохранением и
   офлайн-очередью, фото (загрузка из галереи и камеры). Подключено к API v1 и проверено в симуляторе iOS целиком на
   локальном сервере (тестовая база `mybook_visual`, сид `scripts/visual/seed.ts`): вход, полка, книга, ответ сохранился
   в базе, фото загрузилось и вернулось миниатюрой. Сделано 25.11: создание книги (мастер, bookWizard) и голос → текст (answerDictate).
   Удаление аккаунта и документы — 25.11: «Аккаунт» → политика и оферта (appConfig), «Удалить аккаунт…» — что удалится
   и что останется, пароль, «Удалить навсегда?» (meDeletionInfo/meDelete — сервер и дочистка go-pilot, 40608e2c; тексты
   те же, что в кабинете сайта). Push клиенту — 25.11: регистрация/отписка устройства (`mobile/lib/client/push.dart`,
   `meDevicePut`/`meDeviceDelete`), переход в книгу/заказ по тапу и холодному запуску, отправка с сервера на 4 события
   (`src/server/client-push.ts`: книга готова, заказ оплачен, заказ отправлен, ответ менеджера; гейт `notify.auto=off`).
   До выпуска: аккаунты магазинов, значок 1024 px, проверка голос → текст на проде.
2. **v2 — заказ и оплата (сделано 24.11, проверено в симуляторе на тестовой базе; Kaspi Pay локально не проверить —
   кассир общий с my-test):** src/server/checkout.ts и order-view.ts — одна логика с сайтом, API v1
   cabinet-orders.ts. Было в плане: тарифы, доставка, оплата Kaspi / CloudPayments (страница оплаты, статус по возврату),
   статус заказа.
3. **v3 — остальное:** места фото и помощник по книге — сделаны 24.11; превью, чтение и 3D-книга — сделаны 25.11
   (`preview_screen.dart`, API v1 bookBuild); 3D-книга (`book3d_view.dart`, API v1 bookModel — всё с сервера) и обложка
   в режиме «Шаблон» (`cover_screen.dart`, coverGet/coverUpdate) — 25.11; письма близких и отзыв — 25.11 (`letters_screen.dart`,
   `review_screen.dart`); редактор фото (`photo_editor_screen.dart`, API v1 `photoEdit*`), конструктор обложки
   (`cover_designer.dart`, API v1 `coverDesign*`: шаблоны, фото, тексты, «Декоративные линии», 22 мотива, 24 макета,
   31 шрифт, лицо/оборот/развёртка) и свои видео/аудио по QR (`answer_media_sheet.dart`, API v1 `answerMedia*`/`answerFile*`:
   чанковая загрузка, векторный QR, плеер, докупка минут через Kaspi Pay) — сделаны 25.11.

Для магазинов (решение владельца): аккаунт разработчика Apple для публикации (ILM-HUB — клиентский аккаунт, публиковать
«MyBooks» стоит со своего), аккаунт Google Play, значок 1024 px в хорошем качестве (сейчас — увеличенный знак сайта
`assets/client/icon.png`), политика конфиденциальности и удаление аккаунта из приложения (требование обоих магазинов).
