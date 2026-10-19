-- Статистика повторных продаж по правилу (contacts-16): сделка помнит правило, которое её создало; «создано /
-- выиграно / оплачено за 90 дней» в «Автоматизациях» — по частичному индексу. Удалили правило — ссылка обнуляется,
-- сделка остаётся. Прошлые повторные сделки не размечаются: правило по источнику не восстановить (источник «повторная»
-- ставят и вручную), счёт идёт с выкладки.
ALTER TABLE "crm_deals" ADD COLUMN "automation_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_automation_id_crm_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."crm_automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_deals_automation_idx" ON "crm_deals" USING btree ("automation_id") WHERE "crm_deals"."automation_id" is not null;
