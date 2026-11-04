# Инвентаризация MyBooks

> Сгенерировано `scripts/microservices/inventory.mjs` 2026-11-04T22:29:14.195Z.
> Ветка `refactor/microservices`, коммит `896a123f`.

## Сводка

| Метрика | Значение |
|---|---:|
| Файлов в `src/` | 1587 |
| Файлов TypeScript | 1583 |
| Строк TypeScript | 166199 |
| Тестовых файлов | 275 |
| Тестов (`it`/`test`) | 2824 |
| API-роутов | 138 |
| Страниц | 81 |
| Server actions | 38 |
| Модулей (bounded contexts) | 17 |
| Таблиц | 54 |
| Миграций | 91 |
| Файлов с `container()` | 202 |
| Вызовов `container()` | 643 |
| Внешних ключей между схемами | 66 |

## Код по слоям

| Слой | Файлов | Строк |
|---|---:|---:|
| `app/` | 470 | 40480 |
| `components/` | 220 | 34019 |
| `modules/` | 373 | 43546 |
| `lib/` | 313 | 30448 |
| `shared/` | 70 | 3739 |
| `server/` | 48 | 4739 |
| `i18n/` | 78 | 8398 |
| `config/` | 2 | 426 |

## Модули

| Модуль | Файлов | Строк |
|---|---:|---:|
| `messaging` | 50 | 13999 |
| `ordering` | 46 | 5156 |
| `production` | 39 | 4181 |
| `authoring` | 25 | 3058 |
| `reporting` | 35 | 2932 |
| `sales` | 27 | 2769 |
| `assistant` | 22 | 2052 |
| `automation` | 16 | 1917 |
| `clients` | 9 | 1129 |
| `workspace` | 17 | 1107 |
| `telephony` | 13 | 1083 |
| `identity` | 17 | 1037 |
| `access` | 16 | 866 |
| `notifications` | 9 | 681 |
| `feedback` | 12 | 641 |
| `marketing` | 10 | 580 |
| `referrals` | 10 | 358 |

## Таблицы по владельцам схемы

| Схема | Таблиц | Таблицы |
|---|---:|---|
| `access` | 2 | `crm_roles`, `crm_audit` |
| `authoring` | 11 | `books`, `book_questions`, `book_chapters`, `photos`, `photo_edits`, `book_letters`, `design_ai_requests`, `design_ai_credits`, `design_ai_purchases`, `answer_files`, `answer_file_purchases` |
| `automation` | 2 | `crm_automations`, `crm_automation_runs` |
| `clients` | 2 | `crm_notes`, `crm_tasks` |
| `feedback` | 1 | `reviews` |
| `identity` | 3 | `users`, `sessions`, `password_resets` |
| `marketing` | 3 | `crm_links`, `crm_link_clicks`, `marketing_spend` |
| `messaging` | 4 | `crm_conversations`, `crm_messages`, `crm_bot_events`, `crm_blocklist` |
| `notifications` | 1 | `email_log` |
| `ordering` | 6 | `orders`, `order_payments`, `promo_codes`, `gift_cards`, `payment_invoices`, `order_events` |
| `outbox` | 1 | `outbox_events` |
| `referrals` | 1 | `referral_rewards` |
| `sales` | 9 | `crm_pipelines`, `crm_stages`, `crm_deals`, `crm_payments`, `deal_invoices`, `crm_receipts`, `crm_stage_history`, `crm_saved_views`, `crm_plans` |
| `telephony` | 1 | `crm_calls` |
| `workspace` | 7 | `crm_notifications`, `crm_templates`, `crm_fields`, `crm_mobile_devices`, `crm_pinned_chats`, `crm_push_subscriptions`, `crm_settings` |

## Внешние ключи между схемами

Это главный блокер разделения баз: пока ключ идёт из одной схемы в другую,
владельцы таблиц не независимы.

| Направление | Ключей |
|---|---:|
| sales -> identity | 13 |
| authoring -> identity | 6 |
| clients -> identity | 6 |
| ordering -> identity | 6 |
| workspace -> identity | 6 |
| messaging -> identity | 5 |
| clients -> ordering | 2 |
| clients -> sales | 2 |
| marketing -> identity | 2 |
| messaging -> sales | 2 |
| referrals -> identity | 2 |
| telephony -> identity | 2 |
| access -> identity | 1 |
| feedback -> ordering | 1 |
| feedback -> identity | 1 |
| identity -> access | 1 |
| notifications -> identity | 1 |
| ordering -> authoring | 1 |
| referrals -> ordering | 1 |
| referrals -> sales | 1 |
| sales -> ordering | 1 |
| sales -> automation | 1 |
| telephony -> sales | 1 |
| workspace -> messaging | 1 |

## API-роуты по префиксам

| Префикс | Роутов |
|---|---:|
| `mobile` | 54 |
| `books` | 30 |
| `admin` | 29 |
| `integrations` | 5 |
| `payments` | 4 |
| `chat` | 2 |
| `orders` | 2 |
| `reviews` | 2 |
| `cover-photos` | 1 |
| `covers` | 1 |
| `design-ai` | 1 |
| `gifts` | 1 |
| `health` | 1 |
| `letters` | 1 |
| `locale` | 1 |
| `media` | 1 |
| `photos` | 1 |
| `v` | 1 |

## Как пересчитать

```sh
node scripts/microservices/inventory.mjs --out docs/microservices/baseline
```
