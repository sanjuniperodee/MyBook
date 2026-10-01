import { api, apiBook, HttpError } from "@/lib/api";
import { container } from "@/server/container";

export const maxDuration = 120;

/** PDF-предпросмотр блока (с водяным знаком и облегчёнными фото). Кэшируется, пока книга не изменилась. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await apiBook(req, id);
  const pdf = await container().previews.preview(id);
  if (!pdf) throw new HttpError(404, "bookNotFound");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="preview.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
});
