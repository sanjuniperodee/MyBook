-- Дизайнер книги: настройки оформления страниц поверх стиля (src/lib/book/interiors/style.ts) и обложка из слоёв
-- (src/lib/book/cover-design). У существующих книг — пусто: вёрстка и обложка прежние.
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "interior_style" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "cover_design" jsonb;
