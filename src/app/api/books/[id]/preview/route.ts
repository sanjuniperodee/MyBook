import { api, apiBook, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { idParams } from "@/server/input";

export const maxDuration = 120;

/** PDF-предпросмотр блока: экранная сборка (облегчённые фото), пока книга не оплачена — с водяным знаком поверх полос. Кэшируется, пока книга не изменилась. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = idParams(await params, "id");
  const { book } = await apiBook(req, id);
  const pdf = await container().previews.preview(id);
  if (!pdf) throw new HttpError(404, "bookNotFound");
  // inline: браузеры внутри мессенджеров не умеют скачивать — они открывают файл; имя — название книги.
  const filename = encodeURIComponent(`${book.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "preview"}.pdf`);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="preview.pdf"; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
    },
  });
});
