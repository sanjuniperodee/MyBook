# 00. Baseline: что измеряем и от чего отталкиваемся

> Замер: 2026-11-05, ветка `refactor/microservices`, база `896a123f`.
> Пересчитать: `node scripts/microservices/inventory.mjs --out docs/microservices/baseline`.

Baseline нужен не для красоты отчёта, а чтобы ловить регрессии при переезде: число таблиц, внешних
ключей, вызовов `container()`, маршрутов и тестов должно меняться **предсказуемо**. Любое изменение
объясняется в [PROGRESS.md](PROGRESS.md).

## 1. Код

| Метрика | Значение |
|---|---:|
| Файлов в `src/` | 1587 |
| TypeScript-файлов | 1583 |
| Строк TypeScript | 166 199 |
| Тестовых файлов | 275 |
| Тестов (фактический прогон Vitest) | **4010 passed, 135 skipped, 0 failed** |
| `npx tsc --noEmit` | **0 ошибок** |
| `eslint .` | 0 ошибок, 6 warnings (pre-existing, не в новом коде) |

### По слоям

| Слой | Файлов | Строк |
|---|---:|---:|
| `src/app` | 470 | 40 480 |
| `src/components` | 220 | 34 019 |
| `src/modules` | 373 | 43 546 |
| `src/lib` | 313 | 30 448 |
| `src/shared` | 70 | 3 739 |
| `src/server` | 48 | 4 739 |
| `src/i18n` | 78 | 8 398 |
| `src/config` | 2 | 426 |

### Модули (bounded contexts)

| Модуль | Строк | Комментарий для распила |
|---|---:|---|
| `messaging` | 13 999 | Самый большой; много внешних интеграций и связей. Выносить после publishing |
| `ordering` | 5 156 | Деньги, вебхуки, идемпотентность. Не выносить первым |
| `production` | 4 181 | Тяжёлый CPU/RAM. Кандидат №1 на отдельный worker |
| `authoring` | 3 058 | Владеет книгами/фото/письмами; связан с production |
| `reporting` | 2 932 | Читает все схемы; выносить последним |
| `sales` | 2 769 | Сделки, воронки, деньги; связан с ordering |
| `assistant` | 2 052 | LLM; хороший кандидат на отдельный gateway |
| `automation` | 1 917 | Правила; зависит от sales/clients/messaging |
| `clients` | 1 129 | Задачи/заметки; связан с sales |
| `workspace` | 1 107 | Настройки, шаблоны, push, live |
| `telephony` | 1 083 | Внешняя АТС; часть conversations |
| `identity` | 1 037 | Фундамент; выносить после снятия FK |
| `access` | 866 | Роли/права; вместе с identity |
| `notifications` | 681 | Письма; часть conversations |
| `feedback` | 641 | Отзывы; можно оставить в core |
| `marketing` | 580 | Ссылки/UTM; ближе к commerce |
| `referrals` | 358 | Награды; ближе к commerce |

## 2. Поверхность приложения

| Метрика | Значение |
|---|---:|
| API-роутов (`src/app/api/**/route.ts`) | 138 |
| Страниц (`page.tsx`) | 81 |
| Файлов server actions | 38 |
| Модулей | 17 |
| Таблиц | 54 |
| SQL-миграций | 91 |

### API-роуты по префиксам

| Префикс | Роутов | Кому принадлежит в target |
|---|---:|---|
| `mobile` | 54 | BFF/мобильный API, читает несколько сервисов |
| `books` | 30 | `publishing` |
| `admin` | 29 | `core` / `platform` / `conversations` по смыслу |
| `integrations` | 5 | `conversations` (Wazzup, GOWA, email, PBX, Zadarma) |
| `payments` | 4 | `commerce` |
| `chat` | 2 | `conversations` |
| `orders` | 2 | `commerce` |
| `reviews` | 2 | `core` (feedback) |
| остальные | 10 | `publishing` / `platform` / `core` |

## 3. Связность, которая определяет порядок распила

### 3.1. Вызовы `container()` — шов для выноса бэкенда

| Метрика | Значение |
|---|---:|
| Файлов с `container()` | 202 |
| Вызовов `container()` | 643 |
| Из них в `src/app` + `src/components` | ~569 (остальное — `src/server`) |

Это одновременно **риск** (много мест) и **удобство** (одна точка входа). План не переписывает 643
места, а меняет реализацию `container()`: тот же интерфейс, другой транспорт. Подробно —
[ADR 0002](adr/0002-backend-extraction-strategy.md).

### 3.2. Внешние ключи между схемами — 66

| Направление | Ключей |
|---|---:|
| `sales -> identity` | 13 |
| `authoring -> identity` | 6 |
| `clients -> identity` | 6 |
| `ordering -> identity` | 6 |
| `workspace -> identity` | 6 |
| `messaging -> identity` | 5 |
| `clients -> ordering` | 2 |
| `clients -> sales` | 2 |
| `marketing -> identity` | 2 |
| `messaging -> sales` | 2 |
| `referrals -> identity` | 2 |
| `telephony -> identity` | 2 |
| остальные | 12 |

Вывод: **identity — главный узел**. Пока все схемы ссылаются на `users.id`, физически разделить БД
нельзя. Поэтому `platform` выносится после publishing/conversations, когда ссылки уже заменены на
идентификаторы без FK.

### 3.3. `reporting` читает всё

`src/modules/reporting/infrastructure` делает выборки из `orders`, `crm_deals`, `users`, `crm_tasks`,
`crm_conversations`, `crm_calls`, `books`, `photos`, `crm_notes`, `crm_notifications`, `reviews`,
`crm_automations` и других таблиц. Это осознанный CQRS-lite: экраны читают read-модель, а не дёргают
чужие сервисы.

Следствие: **reporting остаётся в `core` до появления отдельной read-модели** (волна 6). Если вынести
его раньше, каждый дашборд превратится в 10–20 сетевых вызовов и перестанет совпадать по цифрам.

## 4. Прод и эксплуатация

| Параметр | Значение |
|---|---|
| Сервер | 1 VPS, 4 ядра, 8 ГБ, общий с другими сайтами |
| Процесс | PM2 `mybook`, порт 3040, `max_memory_restart` 4000M |
| Сборка | GitHub Actions, артефакт, `deploy/deploy.sh --artifact` |
| Релизы | `~/mybook-releases/releases/<время>-<sha>`, симлинк `current` |
| Smoke | временный порт 3041, главная, `/kk`, вход, `/api/health` |
| Откат | `deploy/rollback.sh`, миграции не откатываются |
| nginx | `deploy/nginx-mybook.conf`, upstream 3040 + backup 3041 |
| PDF | до 10–60 с на книгу, до ~1 ГБ RAM |
| БД | PostgreSQL, 54 таблицы, 91 миграция |
| Файлы | локальный том `storage/` (фото, PDF, превью) |
| Redis | опционален (`REDIS_URL`), сейчас не обязателен |
| Очереди | in-process `pdfRenderQueue`, планировщик на `setInterval` + advisory locks |

### Что это значит для плана

1. **Память — главный ограничитель.** 6 сервисов по 150–300 МБ + PDF 1.5 ГБ + Postgres/Redis/NATS
   могут не поместиться в 8 ГБ рядом с чужими проектами. До волны 2 нужен бюджет памяти и, вероятно,
   +4–8 ГБ или вторая машина. Это решение пользователя, а не «деталь реализации».
2. **Деплой станет многокомпонентным.** Нужен релизный манифест, порядок миграций и откат каждого
   сервиса. Нельзя просто перезапустить один PM2-процесс.
3. **Smoke-тест 3041** рассчитан на один процесс. Для нескольких сервисов нужен новый сценарий
   (health каждого + сквозной сценарий входа/заказа).
4. **PDF-воркер** надо запускать с собственным лимитом памяти и очередью, иначе он убьёт соседей.

## 5. Визуальный baseline

| Инструмент | Что покрывает | Статус |
|---|---|---|
| `scripts/visual/check.sh` | PDF книги и HTML-полосы, 192 ключа, попиксельная сверка | Есть, использовать как гейт для publishing |
| `tests/pdf-critical.test.ts` | Критичные PDF-сценарии | Есть |
| `tests/characterization/*` | Характеристические снимки вёрстки | Есть |
| Playwright-скриншоты админки/кабинета | Ключевые страницы, ru/kk, desktop/mobile | **Нужно добавить (M0.3)** |
| DTO golden tests | Форма данных, которую получает страница | **Нужно добавить (M0.4)** |
| Parity shadow | Сравнение in-process и HTTP ответов | **Нужно добавить (M0.4)** |

Пока Playwright-стенда нет, «фронт не изменился» держится на тестах страниц и на том, что мы не
трогаем `app/` и `components/`. Это недостаточно для волны 1 — стенд обязателен до переключения.

## 6. Как воспроизвести

```sh
npx tsc --noEmit
npm test
node scripts/microservices/inventory.mjs --out docs/microservices/baseline
bash scripts/visual/check.sh HEAD --quick   # нужен pdftoppm и Chromium headless shell
```

Ожидаемо:

- `tsc` — 0;
- `vitest` — 4010 passed, 135 skipped, 0 failed (в текущем окружении);
- inventory — цифры выше (могут отличаться на несколько единиц после правок);
- visual — 0 отличий на `HEAD` с самим собой; если инструменты не установлены, снимок не состоится
  (код 2), это не провал кода.

## 7. Что считается регрессией

- Любое изменение PDF/HTML книги без согласованного `LAYOUT_VERSION`.
- Любое визуальное отличие админки/кабинета на скриншотах.
- Рост 5xx, p95 latency > +20%, ошибок платежей/сообщений.
- Потеря или дубль доменного события, платежа, сообщения, задачи.
- Появление внешнего ключа между схемами после волны 2.
- Импорт `pg`/`drizzle`/`@/modules/*` из `apps/web` после волны 1.
