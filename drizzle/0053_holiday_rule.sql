-- Праздник через N дней (bots-10, analytics-11): покупатели прошлого года к празднику — выборка покупок за период
-- по вьюхе revenue_events идёт по частичным индексам дат оплаты заказа и выигрыша сделки (платежи — crm_payments_paid_idx).
CREATE INDEX "orders_paid_idx" ON "orders" USING btree ("paid_at") WHERE "orders"."paid_at" is not null;--> statement-breakpoint
CREATE INDEX "crm_deals_closed_idx" ON "crm_deals" USING btree ("closed_at") WHERE "crm_deals"."closed_at" is not null;--> statement-breakpoint
-- Стартовое правило выключено (решение владельца: всё, что касается клиентов, включает руководитель). Клиенту само
-- не пишет: сделка «Повторная продажа», готовый текст на языке клиента в истории сделки и задача менеджеру. Праздники —
-- «Интеграции» → CRM; за 30 дней, покупки за 30 дней до праздника год назад, не больше 30 клиентов в день.
INSERT INTO "crm_automations" ("name", "trigger", "conditions", "actions", "active")
SELECT 'Праздник → повторная продажа', 'occasion.holiday', '{"daysBefore": 30, "windowDays": 30, "perDay": 30}'::jsonb,
  '[{"type": "create_deal", "title": "Повторная продажа: {повод}"},
    {"type": "draft_message",
     "text": "Здравствуйте, {имя}! В прошлом году вы дарили близким книгу MyBooks к празднику «{повод}». В этом году {повод} — {дата}, и новую книгу ещё можно успеть сделать к нему. Подсказать, с чего начать?",
     "textKk": "Сәлеметсіз бе, {имя}! Былтыр «{повод}» мерекесіне жақындарыңызға MyBooks кітабын сыйлаған едіңіз. Биыл {повод} — {дата}, жаңа кітапты мерекеге үлгертуге әлі болады. Неден бастау керектігін айтып берейін бе?"},
    {"type": "create_task", "title": "Поздравить и предложить книгу к празднику «{повод}» ({дата}): {имя} — текст в истории сделки", "dueMinutes": 1440}]'::jsonb,
  false
WHERE NOT EXISTS (SELECT 1 FROM "crm_automations" WHERE "trigger" = 'occasion.holiday');
