-- Полосы глав (src/lib/book/layout.ts PAGINATION_REV_2): начальная полоса главы всегда слева, напротив первой полосы
-- текста, как разворот в «Страницах». Новые и незаказанные книги — сразу 2; заказанные остаются на прежней вёрстке (1):
-- их печатные файлы уже собраны и показанный клиенту макет должен совпадать с печатью. Откат: UPDATE books SET pagination_rev = 1.
ALTER TABLE "books" ADD COLUMN "pagination_rev" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
UPDATE "books" SET "pagination_rev" = 1 WHERE "status" = 'ordered';
