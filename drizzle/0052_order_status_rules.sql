-- Сделка заказа (события заказа → правила CRM и задачи, карточка заказа): поиск по order_id без полного прохода.
CREATE INDEX "crm_deals_order_idx" ON "crm_deals" USING btree ("order_id") WHERE "crm_deals"."order_id" is not null;--> statement-breakpoint
-- Статус заказа клиенту в WhatsApp (P0-8, chats-15): стартовые правила приезжают выключенными (решение владельца: всё,
-- что пишет клиентам, включает руководитель). Тексты на русском и казахском — черновики, их правят в «Автоматизациях».
-- Сообщение уходит только в существующую переписку клиента в WhatsApp, и когда её ведёт бот; окно 09–21, суточный лимит
-- и «не писать первым» действуют. Один раз на статус заказа и на трек-номер.
INSERT INTO "crm_automations" ("name", "trigger", "conditions", "actions", "active")
SELECT 'Книга в печати → сообщение клиенту', 'order.status_changed', '{"orderStatus": "in_production"}'::jsonb,
  '[{"type": "send_message",
     "text": "Здравствуйте, {имя}! Ваша книга по заказу №{заказ} ушла в печать. Обычно это занимает несколько рабочих дней. Как только отправим, пришлём трек-номер. Заказ: {ссылка_на_заказ}",
     "textKk": "Сәлеметсіз бе, {имя}! №{заказ} тапсырыс бойынша кітабыңыз баспаға жіберілді. Әдетте бұл бірнеше жұмыс күнін алады. Жібергеннен кейін трек-нөмірін жолдаймыз. Тапсырыс: {ссылка_на_заказ}"}]'::jsonb,
  false
WHERE NOT EXISTS (SELECT 1 FROM "crm_automations" WHERE "trigger" = 'order.status_changed');--> statement-breakpoint
INSERT INTO "crm_automations" ("name", "trigger", "conditions", "actions", "active")
SELECT 'Книга отправлена + трек-номер → сообщение клиенту', 'order.tracking_added', '{}'::jsonb,
  '[{"type": "send_message",
     "text": "Здравствуйте, {имя}! Ваша книга по заказу №{заказ} напечатана и отправлена. Трек-номер: {трек}. Отследить и посмотреть заказ: {ссылка_на_заказ}",
     "textKk": "Сәлеметсіз бе, {имя}! №{заказ} тапсырыс бойынша кітабыңыз басылып, жеткізуге берілді. Трек-нөмір: {трек}. Тапсырысты бақылау: {ссылка_на_заказ}"}]'::jsonb,
  false
WHERE NOT EXISTS (SELECT 1 FROM "crm_automations" WHERE "trigger" = 'order.tracking_added');
