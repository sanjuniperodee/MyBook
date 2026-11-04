# 05. Контракты, auth и сохранение фронтенда

> Это «конституция» переезда: что именно считается совместимым, как это проверяется и что нельзя
> менять без согласования.

## 1. Что значит «фронт не изменился»

Совместимость держится на четырёх уровнях. Все четыре обязательны.

| Уровень | Что проверяем | Инструмент |
|---|---|---|
| URL | Все существующие пути, методы, коды ответов, заголовки кэша | Контрактные тесты + nginx-конфиг |
| Данные | Форма и значения DTO, которые получает страница/клиент | Golden DTO + parity |
| Разметка и стили | DOM, CSS, тексты, порядок элементов | Playwright-скриншоты + HTML-снимки |
| Поведение | Клики, формы, автосохранение, оплата, чат | E2E-сценарии |

Если меняется URL, форма ответа, текст или CSS — это **изменение поведения**, а не рефакторинг.
Оно допускается только с явным согласованием и отдельным пунктом в PROGRESS.

## 2. Публичные URL не меняются

- `/api/mobile/*` — Flutter-приложение; контракт особенно жёсткий (старые версии приложения в сторах).
- `/api/books/*`, `/api/admin/*`, `/api/orders/*`, `/api/payments/*`, `/api/chat/*`,
  `/api/integrations/*`, `/api/reviews/*`, `/api/gifts/*`, `/api/letters/*`, `/api/media/*`,
  `/api/covers/*`, `/api/cover-photos/*`, `/api/design-ai/*`, `/api/locale`, `/api/health`.
- Server actions: URL страницы + `Next-Action` заголовок; их не переписываем, они остаются в web.

Маршрутизация:

- nginx отдаёт `/api/*` владельцу (api/core/publishing/conversations).
- `/api/internal/*` — `deny all`; доступ только из localhost.
- Если сервис ещё не выделен, маршрут остаётся в `api` (core).
- При переключении сервиса nginx-конфиг меняется атомарно с релизом; откат — обратно.

## 3. Внутренний RPC (только волна 1, временный шов)

```
POST /internal/v1/rpc
x-internal-token: <hmac>
x-request-id: <uuid>
content-type: application/json

{
  "path": "ordering.orders.place",
  "args": [ { ... } ],
  "meta": { "locale": "ru", "userId": "..." }
}
```

Ответ:

```json
{ "ok": true, "data": { "...": "superjson" } }
```

или

```json
{ "ok": false, "error": { "code": "ordering.promo_exhausted", "message": "...", "params": {} } }
```

Правила:

- Allowlist путей: только публичные фасады модулей (`ordering.orders`, `authoring.queries`,
  `reporting.dashboard`, ...). Не `infrastructure`, не репозитории, не `container()` целиком.
- HMAC: `HMAC-SHA256(secret, timestamp + "." + body)`, окно ±60 с, secret из env.
- Только localhost/приватная сеть.
- `superjson` для `Date`, `Map`, `Set`, `BigInt`, `undefined`.
- Не логировать `args`/`data` (PII); логировать path, duration, status, requestId.
- Таймаут 30 с (120 с для рендера); размер ответа > 2 МБ — отдельный роут.
- RPC не является публичным контрактом и удаляется после волны 2–3, когда появятся явные API.

Почему не tRPC: он привязывает web к реализации и затрудняет переход на OpenAPI. RPC — временный
транспорт, а не архитектура.

## 4. OpenAPI и версии

- Новые сервисы отдают OpenAPI 3.1 из Zod (`fastify-type-provider-zod` + `zod-to-openapi`).
- Публичный префикс `/api/v1` — только для новых endpoint'ов; существующие URL не переименовываем.
- Внутренний префикс `/internal/v1`.
- Ломающие изменения: новый мажор + период двойной поддержки; старый помечается `deprecated`.
- Контрактный тест: каждый роут проверяется на соответствие схеме (валидация ответа Zod).
- Генерация клиента: `openapi-typescript` → `openapi-fetch`; клиент коммитится или генерируется в CI.

Пример ошибки:

```json
{
  "error": "Промокод закончился",
  "code": "ordering.promo_exhausted",
  "params": { "promo": "LOVE10" },
  "requestId": "01J..."
}
```

Статусы — из существующего реестра `domainStatus`; не менять коды без согласования.

## 5. События

### 5.1. Конверт

```json
{
  "id": "0190f...",
  "type": "core.order.paid.v1",
  "occurredAt": "2026-11-05T10:00:00.000Z",
  "producer": "core",
  "subject": "order:0190...",
  "correlationId": "01J...",
  "causationId": "01J...",
  "version": 1,
  "payload": { "orderId": "...", "number": 123, "amount": 49900 }
}
```

### 5.2. Правила

- Тип: `<service>.<aggregate>.<event>.v1`; версия в типе, не в payload.
- Только факты в прошедшем времени; команды — HTTP.
- At-least-once; consumer обязан быть идемпотентным.
- Inbox: таблица `(event_id, consumer)` с уникальным индексом; обработка в той же транзакции, что и
  эффект.
- Outbox: событие пишется в БД в той же транзакции; relay публикует в NATS; повтор при сбое.
- DLQ + алерт; replay вручную.
- Схемы — Zod/JSON Schema в `packages/contracts/events`; обратная совместимость: только добавлять
  поля, не удалять/не менять типы в рамках `v1`.
- PII: в событиях только ID; тексты/телефоны — по запросу к владельцу.

### 5.3. Какие события уже есть

Сейчас `src/server/subscriptions.ts` — карта связей. При выносе сервисов она превращается в
подписки:

| Событие | Кто публикует | Кто слушает |
|---|---|---|
| `ordering.order_placed` | core | core (CRM), conversations (уведомление), referrals |
| `ordering.order_paid` | core | core (CRM), referrals, publishing (сборка) |
| `ordering.order_status_changed` | core | core (automation), conversations |
| `sales.deal_created` | core | core (automation), conversations |
| `sales.deal_stage_changed` | core | core (automation) |
| `authoring.book_started` | publishing | core (CRM) |
| `authoring.book_progressed` | publishing | core (CRM) |
| `identity.user_registered` | platform | core (CRM) |
| `messaging.message_received` | conversations | core (CRM), ai (bot) |

При выносе сервиса событие получает новый тип (`core.…`/`publishing.…`), а потребители — подписку.
На время перехода допускается двойная публикация (старый и новый тип) с идемпотентностью.

## 6. Аутентификация и контекст пользователя

### 6.1. Схема

```
Browser/Flutter
  │ cookie mb_session / Bearer
  ▼
web (BFF) ── introspect ──► platform
  │  ◄── UserContext + internal JWT (60 s, aud=service)
  │
  ├── Authorization: Bearer <internal JWT>
  ▼
service (core/publishing/...)
  └── verify JWT по JWKS platform; scopes/perm
```

- Cookie остаётся на публичном домене; API не ставит свою cookie.
- `UserContext`: `userId`, `role`, `staff`, `permissions`, `securityPassed`, `sessionId`, `expiresAt`.
- JWT: EdDSA (`Ed25519`), `kid`, `iss=platform`, `aud=<service>`, `exp=60s`. Кэш в Redis по хешу
  сессии 30–60 с.
- Permissions: те же ключи, что сейчас (`clients.view`, `orders.edit`, ...). Сервис проверяет их
  повторно (defense in depth).
- Публичные вебхуки: без пользовательского JWT; подпись провайдера + IP allowlist, если есть.

### 6.2. Что нельзя менять

- Имена cookie, TTL сессии, поведение 2FA-билета, редиректы, тексты ошибок входа.
- Правила IP-allowlist и обязательной 2FA.
- Видимость «только свои» (Viewer `{userId, seesAll}`).
- Формат `Authorization: Bearer` для Flutter.

## 7. Идемпотентность и деньги

| Операция | Ключ | Хранение | Поведение |
|---|---|---|---|
| Создание заказа | `Idempotency-Key` | Redis 24 ч + БД | повтор возвращает тот же заказ |
| Платёж | `provider_event_id` + `order_id` | БД unique | повтор не удваивает |
| Вебхук Kaspi/CloudPayments | `event_id`/`payment_id` | БД unique | повтор игнорируется |
| Сообщение | `client_message_id` | БД unique | повтор не отправляет дважды |
| Событие | `event.id` + consumer | inbox unique | повтор не применяет эффект |
| Счёт из чата | `invoice_id` | БД unique | повтор не выдаёт доступ дважды |

Правило: **сначала запись намерения, потом внешний вызов**. Для платежей — файл чека до записи
платежа (уже исправлено в B4); для сообщений — outbox до отправки.

## 8. Parity-стенд

### 8.1. Режимы

| Режим | Что делает | Где |
|---|---|---|
| `off` | Только in-process | прод до волны 1 |
| `shadow` | Вызывает оба, сравнивает, отдаёт in-process | канарейка 3–5 дней |
| `strict` | Расхождение = 500 | тесты/staging |
| `http` | Только HTTP | прод после гейта |

### 8.2. Что сравниваем

- Read-модели: `reporting.dashboard`, `reporting.dealCard`, `reporting.clientCard`,
  `reporting.lists`, `authoring.queries.bookForEditor`, `ordering.queries.orderDetails`,
  `messaging.view.chat`, `workspace.settings`.
- Команды: результат (ID/статус) и побочные эффекты в БД (сравнение снимков таблиц до/после).
- Страницы: HTML после нормализации (убрать nonce, timestamp, requestId, случайные ID).
- API-роуты: статус, заголовки, JSON.

### 8.3. Нормализация

- `Date` → ISO; `undefined` → отсутствие ключа.
- Порядок массивов: если контракт не гарантирует — сортировать по ID.
- `requestId`, `now`, `createdAt` — маскировать.
- Числа: одинаковая точность/формат (тенге — целые).
- Ошибки: сравнивать `code`, не текст (текст может зависеть от локали).

### 8.4. Отчёт

`tests/microservices/parity-report.json`:

```json
{
  "mode": "shadow",
  "total": 120,
  "mismatches": [
    { "path": "reporting.dashboard", "field": "revenue", "inprocess": 100, "http": 99, "requestId": "..." }
  ]
}
```

Гейт: 0 mismatches на ключевых путях; остальные — объяснены и закрыты.

## 9. Визуальная регрессия

- Playwright `toHaveScreenshot` с `maxDiffPixelRatio: 0`.
- Эталоны — в `tests/visual/screenshots/`; обновление только осознанно, с записью в PROGRESS.
- Маски: время, относительные даты, счётчики, аватары, QR, случайные обложки.
- Прогон: ru и kk, desktop/mobile, ключевые маршруты (см. M0.3).
- CI: отдельный job с Postgres; при падении — артефакт с diff.
- Для PDF/HTML — существующий `scripts/visual/check.sh`; он остаётся главным гейтом publishing.

## 10. Флаги и канарейка

- `BACKEND_MODE=off|shadow|strict|http` — волна 1.
- `PUBLISHING_MODE=core|http` — волна 2.
- `CONVERSATIONS_MODE=core|http` — волна 3.
- `PLATFORM_MODE=core|http` — волна 4.
- `AI_MODE=core|http` — волна 5.
- Флаги читаются из env/БД; не требуют пересборки.
- Канарейка: 1–5% трафика или отдельный тестовый аккаунт; смотреть 5xx, p95, ошибки, parity.
- После стабилизации флаг удаляется; два пути не живут вечно.

## 11. Чек-лист совместимости перед переключением

- [ ] Все публичные URL отвечают теми же методами/статусами.
- [ ] JSON-форма и значения совпадают с golden (кроме согласованных полей).
- [ ] Cookie/заголовки/редиректы входа не изменились.
- [ ] Playwright: 0 визуальных диффов.
- [ ] PDF/HTML: 0 диффов.
- [ ] Flutter: контрактные тесты `mobile` API зелёные (или ручная проверка на сборке).
- [ ] Ошибки: коды и тексты на ru/kk те же.
- [ ] Файлы/SSE/стриминг: те же заголовки, диапазоны, кэш.
- [ ] Откат по флагу проверен.
- [ ] Метрики/трейсы нового пути видны.
