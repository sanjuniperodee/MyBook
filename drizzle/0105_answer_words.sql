-- Слова ответа считаются при записи (было — regexp_matches по всем ответам на каждый запрос CRM: /admin, сделки, книги,
-- автописьма). Шаблон — WORD_PATTERN из src/shared/infrastructure/db/bookProgress.ts (как countWords в JS).
-- Столбец только в базе: в схеме drizzle его нет (вставки и правки его не пишут), читают wordsSql/answeredSql.
CREATE OR REPLACE FUNCTION mybook_word_count(t text) RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ select count(*)::int from regexp_matches(t, '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', 'g') $$;--> statement-breakpoint
ALTER TABLE "book_questions" ADD COLUMN IF NOT EXISTS "answer_words" integer GENERATED ALWAYS AS (mybook_word_count("answer")) STORED;
