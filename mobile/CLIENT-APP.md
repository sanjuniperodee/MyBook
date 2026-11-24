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
   в базе, фото загрузилось и вернулось миниатюрой. До выпуска: фото книги в модели редактора (контракт), голос → текст,
   создание книги, push клиенту, аккаунты магазинов.
2. **v2 — заказ и оплата:** тарифы, доставка, оплата Kaspi / CloudPayments (страница оплаты, статус по возврату),
   статус заказа.
3. **v3 — остальное:** места фото и редактор фото, превью и чтение, 3D-книга, обложка (шаблоны, фото, тексты,
   «Декоративные линии»), письма близких, свои видео и аудио по QR, отзыв, помощник по книге.

Для магазинов (решение владельца): аккаунт разработчика Apple для публикации (ILM-HUB — клиентский аккаунт, публиковать
«MyBooks» стоит со своего), аккаунт Google Play, значок 1024 px в хорошем качестве (сейчас — увеличенный знак сайта
`assets/client/icon.png`), политика конфиденциальности и удаление аккаунта из приложения (требование обоих магазинов).
