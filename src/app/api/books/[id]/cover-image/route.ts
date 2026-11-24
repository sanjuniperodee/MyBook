import { api, apiBook } from "@/server/api";
import { COVER_IMAGE_WIDTHS, coverImage, coverImageVersion, type CoverImageWidth } from "@/server/cover-image";

export const maxDuration = 60;

/**
 * Лицевая крышка книги картинкой для приложения (полка, страница книги): ?w=240|480|900, &v=<версия> — адрес меняется
 * вместе с обложкой, поэтому картинка кэшируется надолго. Доступ — как к книге (автор или сотрудник с правом).
 */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { book } = await apiBook(req, (await params).id);
  const w = Number(new URL(req.url).searchParams.get("w"));
  const width: CoverImageWidth = (COVER_IMAGE_WIDTHS as readonly number[]).includes(w) ? (w as CoverImageWidth) : 480;
  const img = await coverImage(book, width);
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", ETag: `"${coverImageVersion(book)}-${width}"` } });
});

