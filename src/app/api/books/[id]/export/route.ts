import { api, apiBook, HttpError } from "@/lib/api";
import { loadBookBundle, contentFor } from "@/lib/pdf/render";
import { messagesFor } from "@/i18n/messages";

/** Текст книги одним файлом — резервная копия для клиента. */
export const GET = api(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await apiBook(req, id);
  const bundle = await loadBookBundle(id);
  if (!bundle) throw new HttpError(404, "bookNotFound");
  const c = contentFor(bundle);
  const t = messagesFor(c.language).book;
  const lines: string[] = [c.title.toUpperCase()];
  if (c.subtitle) lines.push(c.subtitle);
  if (c.authorName) lines.push(c.authorName);
  if (c.dedication) lines.push("", c.dedication);
  for (const ch of c.chapters) {
    lines.push("", "", `${t.chapter(ch.number).toUpperCase()}. ${ch.title.toUpperCase()}`);
    for (const it of ch.items) {
      lines.push("");
      if (it.heading) lines.push(it.heading, "");
      lines.push(it.answer);
    }
  }
  const body = lines.join("\r\n") + "\r\n";
  const filename = encodeURIComponent(`${c.title}.txt`);
  return new Response("﻿" + body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="book.txt"; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
    },
  });
});
