-- Фраза последней страницы книги (src/lib/book/end-page.ts): null — «Продолжение следует…», пусто — без фразы,
-- иначе своя. У всех книг null — как раньше.
ALTER TABLE "books" ADD COLUMN "end_text" text;
