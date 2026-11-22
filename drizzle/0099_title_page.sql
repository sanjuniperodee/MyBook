-- Печатать титульный лист (books.title_page, BookContent.titlePage): false — без титула и его оборота. У всех книг true — как раньше.
ALTER TABLE "books" ADD COLUMN "title_page" boolean DEFAULT true NOT NULL;
