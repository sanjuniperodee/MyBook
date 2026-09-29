import { api, apiBook, HttpError } from "@/lib/api";
import { loadBookBundle, renderInterior } from "@/lib/pdf/render";

export const maxDuration = 120;

/** PDF-предпросмотр блока (с водяным знаком и облегчёнными фото). */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await apiBook(req, id);
  const bundle = await loadBookBundle(id);
  if (!bundle) throw new HttpError(404, "Книга не найдена");
  const { pdf } = await renderInterior(bundle, "preview");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="preview.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
