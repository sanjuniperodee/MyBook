-- Почта-заглушка (@phone.invalid) — не отписка (automation-d10): клиентов из WhatsApp заводили с email_opt_out = true,
-- и даже вписав потом настоящую почту, они не получали автописем. Отписка остаётся только у тех, кто отписался сам:
-- писем на заглушку не бывает, значит, и ссылкой отписки они воспользоваться не могли.
UPDATE "users" SET "email_opt_out" = false WHERE "email_opt_out" AND lower("email") LIKE '%@phone.invalid';
