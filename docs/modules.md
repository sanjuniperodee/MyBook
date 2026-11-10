# Карта модулей

> Сгенерировано `node scripts/microservices/module-map.mjs` — не править руками. Свежесть проверяет
> `tests/module-map.test.ts`: изменили модуль — перегенерируйте карту.

Как пользоваться: найдите модуль по задаче, дальше работайте внутри `src/modules/<модуль>` и его тестов.
Модуль не импортирует другие модули: нужное от соседа объявляется портом в `application`, адаптер подставляет
`src/server/container.ts`. Страницы и `src/server` видят модуль через фасад (`@/modules/<модуль>`), `domain` и `ui`.
Проверить один модуль: `npx vitest run <файлы из колонки «Тесты»>`.

| Модуль | Что делает | Файлов / строк | Вызовов `container()` |
|---|---|---:|---:|
| [access](#access) | Access: сотрудники, роли и права, правила безопасности, журнал. | 16 / 866 | 45 |
| [assistant](#assistant) | AI-помощник (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер). | 22 / 2067 | 24 |
| [authoring](#authoring) | Authoring: книги, вопросы, оглавление своей книги, фото, письма близких. | 28 / 3732 | 66 |
| [automation](#automation) | Автоматизации (цифровая воронка CRM). | 16 / 1917 | 9 |
| [clients](#clients) | Клиенты CRM: профиль клиента, задачи и заметки менеджеров. | 9 / 1129 | 29 |
| [feedback](#feedback) | Отзывы: отзыв клиента о книге, благодарность автору, модерация и витрина. | 12 / 641 | 7 |
| [identity](#identity) | Identity: учётные записи, вход, пароли, второй фактор. | 17 / 1037 | 19 |
| [marketing](#marketing) | Маркетинг: каналы привлечения, короткие ссылки, предложения из чата. | 10 / 581 | 13 |
| [messaging](#messaging) | Переписка: единый инбокс, бот-квалификатор, виджет на сайте. | 51 / 14283 | 119 |
| [notifications](#notifications) | Уведомления: автописьма, напоминания из CRM, отписка. | 9 / 692 | 6 |
| [ordering](#ordering) | Заказы. Остальной код видит только его. | 46 / 5338 | 87 |
| [production](#production) | Производство: вёрстка PDF книги и сертификатов, предпросмотры полос и обложек, файлы для типографии, очередь сборки. В container — previews (BookPreviewService) и printFiles. | 39 / 4245 | 0 |
| [referrals](#referrals) | Приглашения: код для друзей, награда за их заказы и покупки из чата. | 10 / 358 | 3 |
| [reporting](#reporting) | Отчёты CRM — сторона чтения (CQRS): сводные выборки по нескольким контекстам для страниц (дашборд, аналитика, поиск, «Мой день»). Только чтение, без бизнес-правил: команды идут через модули контекстов. | 36 / 3256 | 53 |
| [sales](#sales) | Продажи: сделки, воронки, этапы, дубли, воронка по действиям на сайте. | 27 / 2797 | 86 |
| [telephony](#telephony) | Телефония: журнал звонков из АТС, звонки из CRM, веб-телефон, записи, звонки WhatsApp. | 13 / 1083 | 27 |
| [workspace](#workspace) | Рабочее пространство CRM: свои поля, шаблоны ответов, уведомления и push сотрудников. | 18 / 1192 | 18 |

## access

Access: сотрудники, роли и права, правила безопасности, журнал.

- Папка: `src/modules/access` (domain, application, infrastructure, ui)
- Фасад: `AccessModule` → `container().access`
- Публичное: `resolver`, `team`, `roles`, `security`, `audit`, `queries`, `shifts`
- Таблицы: `crm_roles`, `crm_audit`
- Тесты (8): `access-audit.test.ts`, `crm-v4.test.ts`, `crm.test.ts`, `errors.test.ts`, `identity-access.test.ts`, `my-day-tasks.test.tsx`, `server-adapters-actions.test.ts`, `workspace-ports.test.ts`

## assistant

AI-помощник (Claude, ChatGPT, DeepSeek или свой OpenAI-совместимый сервер).

- Папка: `src/modules/assistant` (domain, application, infrastructure)
- Фасад: `AssistantModule` → `container().assistant`
- Публичное: `service`, `proofreader`, `writer`, `seller`, `designSettings`, `designerFor`, `writerProvider`, `proofreadProvider`, `sellerProvider`, `sellerFallbacks`, `mediaProvider`, `mediaModel`
- Таблицы: своих нет
- Тесты (11): `ai-providers.test.ts`, `assistant.test.ts`, `crm-modes.integration.test.ts`, `crm-v4.test.ts`, `delivery-abroad.test.ts`, `llm-router.test.ts`, `proofread-ai.test.ts`, `rewrite.test.ts`, `system-blocks.test.ts`, `template-draft.test.ts`, `workspace-ports.test.ts`

## authoring

Authoring: книги, вопросы, оглавление своей книги, фото, письма близких.

- Папка: `src/modules/authoring` (domain, application, infrastructure)
- Фасад: `AuthoringModule` → `container().authoring`
- Публичное: `books`, `questions`, `outline`, `photos`, `letters`, `ordering`, `layoutRev`, `queries`, `photoRepository`, `themes`, `designAi`, `photoFile`, `photoViewFile`
- Таблицы: `books`, `book_questions`, `book_chapters`, `photos`, `photo_edits`, `book_letters`, `design_ai_requests`, `design_ai_credits`, `design_ai_purchases`, `answer_files`, `answer_file_purchases`
- Тесты (21): `authoring.test.ts`, `book-modes.integration.test.ts`, `book-modes.test.ts`, `book-wizard.test.tsx`, `chapter-opener-left.test.tsx`, `crm-modes.integration.test.ts`, `editor-book-content.test.ts`, `editor-outline.test.ts`, `errors.test.ts`, `foreign-access.test.ts`, `layout-rev2-property.test.ts`, `layout-rev2.integration.test.ts`, `layout-rev2.test.ts`, `pages-photos.test.tsx`, `photo-crop.test.ts`, `photo-damage.test.ts`, `photo-edit.test.ts`, `photo-pages.test.ts`, `photo-rotate.test.ts`, `server-adapters-access.test.ts`, `server-adapters.test.ts`

## automation

Автоматизации (цифровая воронка CRM).

- Папка: `src/modules/automation` (domain, application, infrastructure)
- Фасад: `AutomationModule` → `container().automation`
- Публичное: `engine`, `rules`
- Таблицы: `crm_automations`, `crm_automation_runs`
- Тесты (7): `automation-runs.integration.test.ts`, `automation-scheduled.integration.test.ts`, `automation-subjects.integration.test.ts`, `automation.test.ts`, `crm.test.ts`, `holidays.test.ts`, `workspace-ports.test.ts`

## clients

Клиенты CRM: профиль клиента, задачи и заметки менеджеров.

- Папка: `src/modules/clients` (domain, application, infrastructure)
- Фасад: `ClientsModule` → `container().clients`
- Публичное: `clients`, `tasks`, `notes`, `links`, `usage`, `accountsByOtherPhones`, `onboarding`, `contact`
- Таблицы: `crm_notes`, `crm_tasks`
- Тесты (5): `agreement-gifts.test.ts`, `clients-onboarding.test.ts`, `clients.test.ts`, `discount-limit.test.ts`, `task-overdue.integration.test.ts`

## feedback

Отзывы: отзыв клиента о книге, благодарность автору, модерация и витрина.

- Папка: `src/modules/feedback` (domain, application, infrastructure)
- Фасад: `FeedbackModule` → `container().feedback`
- Публичное: `reviews`, `queries`, `photoFile`
- Таблицы: `reviews`
- Тесты (1): `feedback.test.ts`

## identity

Identity: учётные записи, вход, пароли, второй фактор.

- Папка: `src/modules/identity` (domain, application, infrastructure)
- Фасад: `IdentityModule` → `container().identity`
- Публичное: `auth`, `accounts`, `queries`, `tokens`, `passwords`
- Таблицы: `users`, `sessions`, `password_resets`
- Тесты (7): `crm-v4.test.ts`, `errors.test.ts`, `identity-access.test.ts`, `identity-phone.integration.test.ts`, `security.test.ts`, `server-adapters-access.test.ts`, `server-adapters-actions.test.ts`

## marketing

Маркетинг: каналы привлечения, короткие ссылки, предложения из чата.

- Папка: `src/modules/marketing` (domain, application, infrastructure)
- Фасад: `MarketingModule` → `container().marketing`
- Публичное: `service`, `links`, `spend`
- Таблицы: `crm_links`, `crm_link_clicks`, `marketing_spend`
- Тесты (6): `crm.test.ts`, `marketing-spend.integration.test.ts`, `marketing-spend.test.ts`, `marketing-whatsapp.test.ts`, `marketing.test.ts`, `workspace-ports.test.ts`

## messaging

Переписка: единый инбокс, бот-квалификатор, виджет на сайте.

- Папка: `src/modules/messaging` (domain, application, infrastructure, ui)
- Фасад: `MessagingModule` → `container().messaging`
- Публичное: `chats`, `site`, `help`, `queries`, `gowa`, `wazzup`, `email`, `view`, `media`, `bot`, `coach`, `autofill`, `helpQuestionsOf`, `helpStats`, `sendUpload`, `forward`, `transcribe`, `phoneHolder`, `setPhoneHolder`, `materials`, `saveMaterials`, `addMaterial`, `materialFile`, `removeMaterial`, `lessons`, `saveLessons`, `sendToPhone`, `whatsappProvider`, `botStatus`, `previewBot`, `botMetrics`, `botTrace`, `purgeBotTraces`, `connectGowa`, `importGowaHistory`, `syncGowaHistory`, `catchUpGowa`, `verifyGowaWebhook`, `widgetConfig`, `helpConfig`, `siteMessages`
- Таблицы: `crm_conversations`, `crm_messages`, `crm_bot_events`, `crm_blocklist`
- Тесты (47): `agreement-gifts.test.ts`, `ai-autofill.integration.test.ts`, `automation-scheduled.integration.test.ts`, `automation.test.ts`, `bot-admin.test.tsx`, `bot-ai-seller.test.ts`, `bot-coach.test.ts`, `bot-engine.test.ts`, `bot-knowledge.test.ts`, `bot-llm-routing.test.ts`, `bot-materials.test.ts`, `bot-persona.test.ts`, `bot-platform.test.ts`, `bot-remind.test.ts`, `bot-seller.test.ts`, `bot-store.integration.test.ts`, `bot-trace.test.tsx`, `cabinet-help.test.ts`, `chat-inbox-fixes.integration.test.ts`, `chat-inbox-fixes.test.ts`, `chat-media.integration.test.ts`, `chat-media.test.ts`, `chat-message-actions.test.ts`, `chat-sensitive-paths.test.ts`, `crm-v4.test.ts`, `crm.test.ts`, `deal-invoice-payments.test.ts`, `delivery-abroad.test.ts`, `errors.test.ts`, `gowa-catchup.test.ts`, `gowa.test.ts`, `message-retry.integration.test.ts`, `message-retry.test.ts`, `messaging.test.ts`, `no-marketing-actions.test.ts`, `no-marketing.test.ts`, `review-fixes.test.ts`, `rule-sending.test.ts`, `seller-stats.integration.test.ts`, `sensitive.test.ts`, `settings-actions.test.ts`, `site-callback.test.ts`, `staff-line.test.ts`, `telephony.test.ts`, `whatsapp-calls.test.ts`, `whatsapp-media-dedup.test.ts`, `workspace-ports.test.ts`

## notifications

Уведомления: автописьма, напоминания из CRM, отписка.

- Папка: `src/modules/notifications` (domain, application, infrastructure)
- Фасад: `NotificationsModule` → `container().notifications`
- Публичное: `lifecycle`, `reminders`, `subscriptions`
- Таблицы: `email_log`
- Тесты (5): `book-modes.integration.test.ts`, `crm-modes.integration.test.ts`, `lifecycle-whatsapp.test.ts`, `notifications.test.ts`, `time.test.ts`

## ordering

Заказы. Остальной код видит только его.

- Папка: `src/modules/ordering` (domain, application, infrastructure, ui)
- Фасад: `OrderingModule` → `container().ordering`
- Публичное: `orders`, `invoices`, `invoiceLifecycle`, `payments`, `promos`, `gifts`, `queries`, `cloudPayments`, `kaspi`, `kaspiSetup`, `kaspiWatch`, `mailer`, `verifyKaspiWebhook`, `kaspiRecipient`, `deliverDueGifts`, `resendGift`, `giftPdf`
- Таблицы: `orders`, `order_payments`, `promo_codes`, `gift_cards`, `payment_invoices`, `order_events`
- Тесты (38): `agreement-gifts.test.ts`, `automation.test.ts`, `catalog.test.ts`, `checkout-quote.test.ts`, `cloudpayments.test.ts`, `deal-invoice-payments.integration.test.ts`, `deal-invoice-payments.test.ts`, `deal-lifecycle.integration.test.ts`, `deal-lifecycle.test.ts`, `delivery-abroad.test.ts`, `errors.test.ts`, `gift-receipt.integration.test.ts`, `i18n.test.ts`, `invoice-access.test.ts`, `invoice-crm-actions.test.ts`, `invoice-crm.integration.test.ts`, `kaspi-watch.test.ts`, `kaspi.integration.test.ts`, `kaspi.test.ts`, `occasions.test.ts`, `order-money.test.ts`, `order-payments.test.ts`, `order-terms.test.ts`, `ordering-ports.test.ts`, `ordering.test.ts`, `pay-routes.test.ts`, `payments-settings.integration.test.ts`, `print.test.ts`, `promo-stats.integration.test.ts`, `referrals.test.ts`, `review-fixes.test.ts`, `sales-guards.test.ts`, `server-adapters-actions.test.ts`, `server-adapters.test.ts`, `server-routes-payments.test.ts`, `settings-actions.test.ts`, `time.test.ts`, `tools.test.ts`

## production

Производство: вёрстка PDF книги и сертификатов, предпросмотры полос и обложек, файлы для типографии, очередь сборки. В container — previews (BookPreviewService) и printFiles.

- Папка: `src/modules/production` (application, infrastructure)
- Фасад: нет класса-фасада (функции из index.ts)
- Таблицы: своих нет
- Тесты (27): `book-build.test.ts`, `chapter-opener-left.test.tsx`, `characterization/covers.test.ts`, `characterization/fingerprint.test.ts`, `characterization/render.test.ts`, `cover-back-color.test.tsx`, `cover-emoji.test.tsx`, `design-polish.test.tsx`, `end-text.test.tsx`, `fixtures.test.ts`, `gallery-title.test.tsx`, `i18n.test.ts`, `page-layout.test.ts`, `pdf-critical.test.ts`, `pdf-flow.test.ts`, `pdf-frames.test.tsx`, `pdf-media.test.tsx`, `pdf-opener-limits.test.ts`, `pdf-photos.test.tsx`, `pdf-pool-limits.test.ts`, `pdf.test.tsx`, `photo-crop.test.ts`, `print-kinds.test.tsx`, `print-spec.test.ts`, `production.test.ts`, `render-progress.test.ts`, `toc.test.ts`

## referrals

Приглашения: код для друзей, награда за их заказы и покупки из чата.

- Папка: `src/modules/referrals` (domain, application, infrastructure)
- Фасад: `ReferralsModule` → `container().referrals`
- Публичное: `service`
- Таблицы: `referral_rewards`
- Тесты (3): `i18n.test.ts`, `referral-chat.integration.test.ts`, `referrals.test.ts`

## reporting

Отчёты CRM — сторона чтения (CQRS): сводные выборки по нескольким контекстам для страниц (дашборд, аналитика, поиск, «Мой день»). Только чтение, без бизнес-правил: команды идут через модули контекстов.

- Папка: `src/modules/reporting` (infrastructure, ui)
- Фасад: `ReportingModule` → `container().reporting`
- Публичное: `salesAnalytics`, `dashboard`, `attention`, `morningDigest`, `vcardClients`, `paymentsExport`, `myDay`, `search`, `dealById`, `dealCard`, `clientBrief`, `clientById`, `clientCard`, `clientReferrals`, `inbox`, `conversationContext`, `taskList`, `taskById`, `callJournal`, `orderList`, `orderExport`, `productionBoard`, `orderOwnership`, `bookOwnership`, `orderCrm`, `orderNotice`, `dealList`, `dealTotals`, `savedViews`, `stageCounts`, `duplicateGroups`, `bookList`, `counters`, `live`, `clients`, `segmentCounts`, `finance`, `financeIssues`, `automationStats`, `designAi`
- Таблицы: своих нет
- Тесты (24): `attention.integration.test.ts`, `automation-stats.integration.test.ts`, `book-modes.integration.test.ts`, `clients-filters.integration.test.ts`, `clients-filters.test.ts`, `crm-modes.integration.test.ts`, `dashboard-new-clients.integration.test.ts`, `deal-lifecycle.integration.test.ts`, `finance-batch.integration.test.ts`, `finance-screen.test.ts`, `finance.integration.test.ts`, `invoice-crm.integration.test.ts`, `morning-digest.integration.test.ts`, `my-day.integration.test.ts`, `order-deal.integration.test.ts`, `phone-search.integration.test.ts`, `phone-search.test.ts`, `referral-chat.integration.test.ts`, `reporting-screens.test.ts`, `response-stats.test.ts`, `revenue-agreed.integration.test.ts`, `sales-analytics.integration.test.ts`, `time.test.ts`, `vcard.integration.test.ts`

## sales

Продажи: сделки, воронки, этапы, дубли, воронка по действиям на сайте.

- Папка: `src/modules/sales` (domain, application, infrastructure)
- Фасад: `SalesModule` → `container().sales`
- Публичное: `deals`, `routing`, `funnel`, `queries`, `pipelines`, `savedViews`, `plans`, `receipts`, `payments`, `intake`, `agreementFor`, `attachAgreementOrder`, `money`, `refundAfterOrder`, `agreedPlan`, `agreedGifts`, `batch`, `setClientAttribution`, `changeAgreedGifts`, `splitIntoBatch`
- Таблицы: `crm_pipelines`, `crm_stages`, `crm_deals`, `crm_payments`, `deal_invoices`, `crm_receipts`, `crm_stage_history`, `crm_saved_views`, `crm_plans`
- Тесты (22): `automation-stats.integration.test.ts`, `book-modes.integration.test.ts`, `crm.test.ts`, `deal-invoice-payments.integration.test.ts`, `deal-lifecycle.integration.test.ts`, `deal-lifecycle.test.ts`, `deal-merge.test.ts`, `deal-money.integration.test.ts`, `deal-repeat.integration.test.ts`, `discount-limit.test.ts`, `errors.test.ts`, `finance-batch.integration.test.ts`, `finance.integration.test.ts`, `payments-settings.integration.test.ts`, `receipts.test.ts`, `revenue.integration.test.ts`, `routing.integration.test.ts`, `sales-intake.test.ts`, `sales.test.ts`, `server-routes-payments.test.ts`, `time.test.ts`, `workspace-ports.test.ts`

## telephony

Телефония: журнал звонков из АТС, звонки из CRM, веб-телефон, записи, звонки WhatsApp.

- Папка: `src/modules/telephony` (domain, application, infrastructure)
- Фасад: `TelephonyModule` → `container().telephony`
- Публичное: `calls`, `phone`, `whatsapp`, `queries`
- Таблицы: `crm_calls`
- Тесты (5): `call-recordings.test.ts`, `crm.test.ts`, `telephony.test.ts`, `whatsapp-calls.test.ts`, `workspace-ports.test.ts`

## workspace

Рабочее пространство CRM: свои поля, шаблоны ответов, уведомления и push сотрудников.

- Папка: `src/modules/workspace` (domain, application, infrastructure)
- Фасад: `WorkspaceModule` → `container().workspace`
- Публичное: `fields`, `templates`, `personalTemplates`, `inbox`, `pinnedChats`, `financeResolutions`, `settings`, `notifier`, `live`, `fieldsReader`, `schedule`
- Таблицы: `crm_notifications`, `crm_templates`, `crm_fields`, `crm_mobile_devices`, `crm_pinned_chats`, `crm_push_subscriptions`, `crm_settings`, `finance_issue_resolutions`
- Тесты (18): `apns.test.ts`, `auto-shift.test.ts`, `chat-mark-read.test.ts`, `deal-lifecycle.test.ts`, `deal-merge.test.ts`, `design-ai-stats.integration.test.ts`, `discount-limit.test.ts`, `invoice-crm-actions.test.ts`, `kaspi-shared-session.test.ts`, `lead-grab.test.ts`, `marketing-whatsapp.test.ts`, `notify-prefs.test.ts`, `notify.integration.test.ts`, `payments-settings.integration.test.ts`, `sales-guards.test.ts`, `seller-details.test.ts`, `settings-actions.test.ts`, `workspace.test.ts`
