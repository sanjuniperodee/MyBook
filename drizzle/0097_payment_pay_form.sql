-- Форма оплаты каждого платежа (Kaspi Gold, Kaspi Рассрочка, Kaspi Red…): комиссия банка считается с платежа по ней, а не со всей сделки.
ALTER TABLE "order_payments" ADD COLUMN "pay_form" text;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD COLUMN "pay_form" text;
