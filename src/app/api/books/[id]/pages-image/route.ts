import { api, apiBook, HttpError } from "@/server/api";
import { isInteriorId } from "@/lib/book/interiors";
import {
  PAGES_IMAGE_WIDTHS,
  PAGES_SPREADS,
  pagesSpreadImage,
  type PagesImageWidth,
  type PagesSpread,
} from "@/server/pages-image";

export const maxDuration = 60;

/**
 * Разворот «Страниц» картинкой для приложения (?kind=chapter|photos|front|toc, ?w=600|1200): та же вёрстка, что печать,
 * на выборке книги. &design=<id> — другое оформление без настроек (миниатюра и просмотр стиля, в книгу не пишется).
 * &preview=<ключ> — запомненное оформление (вариант ИИ-дизайнера, storePagesPreview). &v=<версия> из API v1 (pagesGet) — адрес меняется вместе с разворотом, поэтому картинка кэшируется надолго.
 */
export const GET = api(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { book } = await apiBook(req, (await params).id);
    const q = new URL(req.url).searchParams;
    const kind = q.get("kind") as PagesSpread;
    const w = Number(q.get("w"));
    const design = q.get("design") ?? undefined;
  const preview = q.get("preview") ?? undefined;
    if (
      !PAGES_SPREADS.includes(kind) ||
      (design !== undefined && !isInteriorId(design)) || (preview !== undefined && !/^[0-9a-f]{16}$/.test(preview))
    )
      throw new HttpError(400, "badRequest");
    const width: PagesImageWidth = (
      PAGES_IMAGE_WIDTHS as readonly number[]
    ).includes(w)
      ? (w as PagesImageWidth)
      : 1200;
    const res = await pagesSpreadImage(book.id, kind, width, design, preview);
    if (!res) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(res.image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${res.version}-${kind}-${width}"`,
      },
    });
  },
);
