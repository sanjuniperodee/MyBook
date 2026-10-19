/**
 * Отзыв: справочники, которые лежат в колонках БД и нужны домену отзывов, интерфейсу и схеме.
 * Схема (общее ядро) не знает модулей, поэтому значения, которые она хранит, объявлены здесь.
 */

/** new — ждёт модерации, published — на сайте, hidden — только в CRM (в сводную оценку всё равно входит). */
export type ReviewStatus = "new" | "published" | "hidden";

/** Фото отзыва в хранилище: ключ и размеры (колонка reviews.photo). */
export interface ReviewPhoto {
  key: string;
  width: number;
  height: number;
}
