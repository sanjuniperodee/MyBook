-- Как начинается глава (src/lib/book/chapter-head.ts): page — своя начальная полоса (у всех книг, как раньше),
-- inline — с новой страницы с текста, номер и название над ним, none — чистый лист без названия.
ALTER TABLE "books" ADD COLUMN "chapter_start" text DEFAULT 'page' NOT NULL;
