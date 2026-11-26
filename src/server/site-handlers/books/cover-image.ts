import "server-only";
import { api, apiBook, HttpError } from "@/server/api";
import { isKnownCover } from "@/lib/book/covers";
import { COVER_IMAGE_WIDTHS, coverImage, coverVersion, type CoverImageOptions, type CoverImageWidth } from "@/server/cover-image";

/**
 * Обложка книги картинкой для приложения (полка, страница книги, редактор обложки): ?w=240|480|900, &v=<версия> — адрес
 * меняется вместе с обложкой, поэтому картинка кэшируется надолго. Доступ — как к книге (автор или сотрудник с правом).
 *   ?side=back — оборот (задняя крышка) той же вёрсткой, что печать;
 *   ?template=<id> — лицо с другим шаблоном и текущими надписями и фото (предпросмотр выбора; в книгу не пишется);
 *   ?side=spread&p=<страниц> — вся развёртка с корешком под это число страниц (3D-книга; w — ширина лица в картинке).
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { book } = await apiBook(req, (await params).id);
  const q = new URL(req.url).searchParams;
  const w = Number(q.get("w"));
  const width: CoverImageWidth = (COVER_IMAGE_WIDTHS as readonly number[]).includes(w) ? (w as CoverImageWidth) : 480;
  const template = q.get("template") ?? undefined;
  if (template !== undefined && !isKnownCover(template)) throw new HttpError(400, "badRequest");
  const side = q.get("side");
  const pages = Math.round(Number(q.get("p")));
  if (side === "spread" && !(pages >= 1 && pages <= 2000)) throw new HttpError(400, "badRequest");
  const o: CoverImageOptions = side === "spread" ? { side: "spread", pages } : side === "back" ? { side: "back" } : template ? { template } : {};
  const img = await coverImage(book, width, o);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", ETag: `"${coverVersion(book, o)}-${width}"` } });
});
