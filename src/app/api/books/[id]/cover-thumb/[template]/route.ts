import { api, apiBook } from "@/server/api";
import { coverTemplateThumb } from "@/server/cover-image";

export const maxDuration = 60;

/**
 * Миниатюра шаблона обложки с фото этой книги на местах шаблона — для выбора обложки в приложении (сайт рисует такие
 * миниатюры сам, в браузере). ?v=<фото> — от набора выбранных фото: адрес меняется вместе с ними, кэш долгий.
 * Доступ — как к книге.
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string; template: string }> }) => {
  const { id, template } = await params;
  const { book } = await apiBook(req, id);
  const img = await coverTemplateThumb(book, template);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" } });
});
