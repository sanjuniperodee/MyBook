ALTER TABLE "referral_rewards" DROP CONSTRAINT "referral_rewards_friend_id_users_id_fk";
--> statement-breakpoint
-- Награда за покупку из чата (contacts-d7) — по сделке: ключ уже не заказ, а своя строка; заказ или сделка — уникальны.
ALTER TABLE "referral_rewards" DROP CONSTRAINT "referral_rewards_pkey";--> statement-breakpoint
ALTER TABLE "referral_rewards" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_rewards" ALTER COLUMN "friend_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD COLUMN "deal_id" uuid;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_rewards_friend_idx" ON "referral_rewards" USING btree ("friend_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_order_idx" ON "referral_rewards" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_deal_idx" ON "referral_rewards" USING btree ("deal_id");--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_purchase" CHECK ("referral_rewards"."order_id" is not null or "referral_rewards"."deal_id" is not null);