-- Правки и «удалить для всех» в WhatsApp не из CRM: прежние тексты (crm_messages.edit_history) и отметка удаления с сохранённым текстом (revoked_at).
ALTER TABLE "crm_messages" ADD COLUMN "edit_history" jsonb;--> statement-breakpoint
ALTER TABLE "crm_messages" ADD COLUMN "revoked_at" timestamp with time zone;