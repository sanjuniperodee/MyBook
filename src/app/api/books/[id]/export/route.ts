import { api, apiBook, HttpError } from "@/lib/api";
import { container } from "@/server/container";

/** Текст книги одним файлом — резервная копия для клиента. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await apiBook(req, id);
  const doc = await container().previews.manuscript(id);
  if (!doc) throw new HttpError(404, "bookNotFound");
  const filename = encodeURIComponent(`${doc.title}.txt`);
  return new Response("﻿" + doc.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="book.txt"; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
    },
  });
});
