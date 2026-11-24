CREATE TABLE "crm_board_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"wip_limit" integer,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_board_members" (
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_board_members_board_id_user_id_pk" PRIMARY KEY("board_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crm_board_rule_runs" (
	"rule_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_board_rule_runs_rule_id_task_id_key_pk" PRIMARY KEY("rule_id","task_id","key")
);
--> statement-breakpoint
CREATE TABLE "crm_board_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"runs" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'team' NOT NULL,
	"department" text,
	"color" text DEFAULT 'slate' NOT NULL,
	"owner_id" uuid,
	"visibility" text DEFAULT 'all' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"template_key" text,
	"position" double precision DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_calendar_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_google_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"access_expires_at" timestamp with time zone,
	"calendar_id" text,
	"sync_token" text,
	"channel_id" text,
	"channel_token" text,
	"resource_id" text,
	"channel_expires_at" timestamp with time zone,
	"pull_requested_at" timestamp with time zone,
	"last_push_at" timestamp with time zone,
	"last_pull_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_google_events" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"etag" text,
	"task_version" timestamp with time zone,
	"meet_url" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_google_events_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "crm_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_task_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_task_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_task_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"text" text NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_id" uuid,
	"assignee_id" uuid,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_task_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_task_labels" (
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"auto" boolean DEFAULT false NOT NULL,
	CONSTRAINT "crm_task_labels_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "crm_task_members" (
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "crm_task_members_task_id_user_id_role_pk" PRIMARY KEY("task_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "crm_task_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"board_id" uuid,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "board_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "column_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "position" double precision;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "cover" text;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "estimate_min" integer;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "spent_min" integer;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "recurrence" jsonb;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "recur_spawned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "book_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "meet" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_board_columns" ADD CONSTRAINT "crm_board_columns_board_id_crm_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."crm_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_board_members" ADD CONSTRAINT "crm_board_members_board_id_crm_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."crm_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_board_members" ADD CONSTRAINT "crm_board_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_board_rule_runs" ADD CONSTRAINT "crm_board_rule_runs_rule_id_crm_board_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."crm_board_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_board_rule_runs" ADD CONSTRAINT "crm_board_rule_runs_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_board_rules" ADD CONSTRAINT "crm_board_rules_board_id_crm_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."crm_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_board_rules" ADD CONSTRAINT "crm_board_rules_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_boards" ADD CONSTRAINT "crm_boards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_calendar_feeds" ADD CONSTRAINT "crm_calendar_feeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_google_accounts" ADD CONSTRAINT "crm_google_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_google_events" ADD CONSTRAINT "crm_google_events_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_google_events" ADD CONSTRAINT "crm_google_events_user_id_crm_google_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_google_accounts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_labels" ADD CONSTRAINT "crm_labels_board_id_crm_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."crm_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_activity" ADD CONSTRAINT "crm_task_activity_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_activity" ADD CONSTRAINT "crm_task_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_attachments" ADD CONSTRAINT "crm_task_attachments_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_attachments" ADD CONSTRAINT "crm_task_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_checklist_items" ADD CONSTRAINT "crm_task_checklist_items_checklist_id_crm_task_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."crm_task_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_checklist_items" ADD CONSTRAINT "crm_task_checklist_items_done_by_id_users_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_checklist_items" ADD CONSTRAINT "crm_task_checklist_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_checklists" ADD CONSTRAINT "crm_task_checklists_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_comments" ADD CONSTRAINT "crm_task_comments_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_comments" ADD CONSTRAINT "crm_task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_labels" ADD CONSTRAINT "crm_task_labels_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_labels" ADD CONSTRAINT "crm_task_labels_label_id_crm_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."crm_labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_members" ADD CONSTRAINT "crm_task_members_task_id_crm_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_members" ADD CONSTRAINT "crm_task_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_views" ADD CONSTRAINT "crm_task_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_task_views" ADD CONSTRAINT "crm_task_views_board_id_crm_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."crm_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_board_columns_board_idx" ON "crm_board_columns" USING btree ("board_id","position");--> statement-breakpoint
CREATE INDEX "crm_board_members_user_idx" ON "crm_board_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "crm_board_rules_board_idx" ON "crm_board_rules" USING btree ("board_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_boards_default_uq" ON "crm_boards" USING btree ("is_default") WHERE "crm_boards"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "crm_calendar_feeds_token_uq" ON "crm_calendar_feeds" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "crm_calendar_feeds_user_idx" ON "crm_calendar_feeds" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_google_events_event_uq" ON "crm_google_events" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "crm_labels_board_idx" ON "crm_labels" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "crm_task_activity_task_idx" ON "crm_task_activity" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_task_attachments_task_idx" ON "crm_task_attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "crm_task_checklist_items_list_idx" ON "crm_task_checklist_items" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "crm_task_checklists_task_idx" ON "crm_task_checklists" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "crm_task_comments_task_idx" ON "crm_task_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_task_labels_label_idx" ON "crm_task_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "crm_task_members_user_idx" ON "crm_task_members" USING btree ("user_id","role");--> statement-breakpoint
CREATE INDEX "crm_task_views_user_idx" ON "crm_task_views" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_board_id_crm_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."crm_boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_column_id_crm_board_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."crm_board_columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_conversation_id_crm_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_tasks_board_idx" ON "crm_tasks" USING btree ("board_id","column_id") WHERE "crm_tasks"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "crm_tasks_updated_idx" ON "crm_tasks" USING btree ("updated_at");--> statement-breakpoint
-- Право «Доски»: общие доски отделов, любые доски, их колонки, участники и автоматизация — руководителю.
UPDATE "crm_roles" SET "permissions" = array_append("permissions", 'boards.manage') WHERE "key" IN ('owner') AND NOT ('boards.manage' = ANY("permissions"));--> statement-breakpoint
-- updated_at карточки меняется при любой правке строки (старый код задач его не ставит): по нему синхронизируются календари.
CREATE OR REPLACE FUNCTION crm_tasks_touch() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS crm_tasks_touch ON "crm_tasks";--> statement-breakpoint
CREATE TRIGGER crm_tasks_touch BEFORE UPDATE ON "crm_tasks" FOR EACH ROW EXECUTE FUNCTION crm_tasks_touch();--> statement-breakpoint
-- Доски отделов по шаблонам (BOARD_TEMPLATES в src/shared/domain/boards.ts) и перенос всех задач на «Продажи»:
-- выполненные — в «Готово», открытые — в «К выполнению». Задачи не меняются, кроме board_id и column_id.
DO $$
DECLARE
  b uuid; c_todo uuid; c_done uuid; c uuid; l_over uuid; l uuid;
  boards jsonb := '[
    {"key":"sales","name":"Продажи","description":"Звонки, сообщения и встречи по сделкам. Сюда попадают задачи из сделок, правил и бота.","department":"sales","color":"wine","default":true,
     "columns":[["К выполнению",false,null],["В работе",false,null],["Ждём клиента",false,null],["Готово",true,null]],
     "labels":[["Просрочено","danger"],["Горячий","wine"],["Повторная продажа","success"],["Подарок к дате","warning"]]},
    {"key":"production","name":"Производство книги","description":"Макет → согласование → печать → доставка: каждая книга — карточка с чек-листом.","department":"production","color":"info","default":false,
     "columns":[["Новые",false,null],["Макет",false,8],["Согласование с клиентом",false,null],["Печать",false,10],["Доставка",false,null],["Готово",true,null]],
     "labels":[["Просрочено","danger"],["Срочно к дате","wine"],["Экспресс","warning"],["Правки","violet"],["Подарок","success"]]},
    {"key":"support","name":"Поддержка","description":"Обращения и просьбы клиентов: от нового до решённого.","department":"support","color":"teal","default":false,
     "columns":[["Новые",false,null],["В работе",false,6],["Ждём ответа клиента",false,null],["Решено",true,null]],
     "labels":[["Просрочено","danger"],["Ошибка сайта","danger"],["Вопрос","info"],["Возврат","warning"]]}
  ]';
  bd jsonb; col jsonb; lab jsonb; i int; cols uuid[];
BEGIN
  IF EXISTS (SELECT 1 FROM crm_boards) THEN RETURN; END IF;
  FOR bd IN SELECT * FROM jsonb_array_elements(boards) LOOP
    INSERT INTO crm_boards (name, description, kind, department, color, visibility, is_default, template_key, position)
    VALUES (bd->>'name', bd->>'description', 'team', bd->>'department', bd->>'color', 'all', (bd->>'default')::boolean, bd->>'key',
            CASE bd->>'key' WHEN 'sales' THEN 1024 WHEN 'production' THEN 2048 ELSE 3072 END)
    RETURNING id INTO b;
    i := 0; cols := ARRAY[]::uuid[];
    FOR col IN SELECT * FROM jsonb_array_elements(bd->'columns') LOOP
      i := i + 1;
      INSERT INTO crm_board_columns (board_id, name, position, done, wip_limit)
      VALUES (b, col->>0, i * 1024, (col->>1)::boolean, NULLIF(col->>2, 'null')::int) RETURNING id INTO c;
      cols := cols || c;
      IF (col->>1)::boolean THEN c_done := c; END IF;
    END LOOP;
    c_todo := cols[1];
    i := 0;
    FOR lab IN SELECT * FROM jsonb_array_elements(bd->'labels') LOOP
      i := i + 1;
      INSERT INTO crm_labels (board_id, name, color, position) VALUES (b, lab->>0, lab->>1, i * 1024) RETURNING id INTO l;
      IF i = 1 THEN l_over := l; END IF;
    END LOOP;
    INSERT INTO crm_board_rules (board_id, name, trigger, actions, position)
    VALUES (b, 'Срок прошёл — метка «Просрочено»', '{"type":"card.overdue"}', jsonb_build_array(jsonb_build_object('type','add_label','labelId',l_over)), 1024);
    IF bd->>'key' = 'production' THEN
      INSERT INTO crm_board_rules (board_id, name, trigger, actions, position) VALUES
        (b, 'Попала в «Макет» — чек-лист вёрстки', jsonb_build_object('type','card.moved','columnId',cols[2]),
         '[{"type":"add_checklist","title":"Макет","items":["Проверить тексты и опечатки","Проверить фото и места фото","Обложка и оборот","Собрать печатные файлы"]}]', 2048),
        (b, 'Попала в «Печать» — срок 7 дней, уведомить', jsonb_build_object('type','card.moved','columnId',cols[4]),
         '[{"type":"set_due","days":7,"hours":0},{"type":"notify","to":"assignees"}]', 3072);
    END IF;
    IF bd->>'key' = 'support' THEN
      INSERT INTO crm_board_rules (board_id, name, trigger, actions, position) VALUES
        (b, 'Взяли в работу — назначить того, кто перенёс', jsonb_build_object('type','card.moved','columnId',cols[2]), '[{"type":"assign","userId":"mover"}]', 2048);
    END IF;
    IF bd->>'key' = 'sales' THEN
      UPDATE crm_tasks SET board_id = b, column_id = CASE WHEN done_at IS NULL THEN c_todo ELSE c_done END WHERE board_id IS NULL;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- Живое обновление досок: любая запись карточки (из досок, «Задач», сделок, правил, бота) — событие в канал CRM
-- (modules/workspace/infrastructure/realtime.ts слушает crm_live), открытые доски перечитывают себя.
CREATE OR REPLACE FUNCTION crm_tasks_live() RETURNS trigger AS $$
DECLARE r record;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  PERFORM pg_notify('crm_live', json_build_object('type', 'board', 'boardId', r.board_id, 'taskId', r.id)::text);
  IF TG_OP = 'UPDATE' AND OLD.board_id IS DISTINCT FROM NEW.board_id THEN
    PERFORM pg_notify('crm_live', json_build_object('type', 'board', 'boardId', OLD.board_id, 'taskId', r.id)::text);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS crm_tasks_live ON "crm_tasks";--> statement-breakpoint
CREATE TRIGGER crm_tasks_live AFTER INSERT OR UPDATE OR DELETE ON "crm_tasks" FOR EACH ROW EXECUTE FUNCTION crm_tasks_live();
