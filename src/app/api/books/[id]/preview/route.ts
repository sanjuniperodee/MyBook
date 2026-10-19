import { api, apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

export const maxDuration = 120;

/** PDF-предпросмотр блока (с водяным знаком и облегчёнными фото). Кэшируется, пока книга не изменилась. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
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
