-- Сообщение о заказе — только в существующую переписку клиента в WhatsApp (P0-8, chats-15): поиск диалога по сделке
-- заказа или по клиенту. Те же индексы нужны карточкам сделки и клиента (их диалоги) и стоп-листу правил.
CREATE INDEX "crm_conv_deal_idx" ON "crm_conversations" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_conv_client_idx" ON "crm_conversations" USING btree ("client_id");
