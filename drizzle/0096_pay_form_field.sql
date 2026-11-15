-- Своё поле сделки «Форма оплаты»: по нему «Прибыль» считает комиссию банка (Kaspi Рассрочка, Red) с денег сделки.
INSERT INTO "crm_fields" ("entity", "key", "label", "type", "options", "position")
SELECT 'deal', 'pay_form', 'Форма оплаты', 'select', ARRAY['Kaspi Gold', 'Kaspi Рассрочка', 'Kaspi Red', 'Перевод', 'Наличные'], coalesce(max("position"), 0) + 1
FROM "crm_fields" WHERE "entity" = 'deal'
ON CONFLICT DO NOTHING;
