"use server";

import { getMessages, lredirect } from "@/i18n/server";
import { isLocale } from "@/i18n/config";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { queueEvent } from "@/server/track";
import { bookKind } from "@/lib/content/kinds";
import { createBookSchema } from "./create-book-schema";

export interface CreateState {
  error?: string;
}

export async function createBookAction(_: CreateState, form: FormData): Promise<CreateState> {
  const user = await requireUser();
  const m = await getMessages();
  const parsed = createBookSchema(m.books.wizard.errors).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const book = await container().authoring.books.start(user.id, {
    theme: d.theme,
    language: isLocale(d.language) ? d.language : "ru",
    authorName: d.authorName,
    authorGender: d.authorGender,
    recipientName: d.recipientName,
    recipientGender: d.recipientGender,
    recordedBy: d.recordedBy,
    firstChapterTitle: d.firstChapterTitle,
    dedication: d.dedication,
    title: d.title,
    occasion: d.occasion || null,
    occasionDate: d.occasion ? d.occasionDate || null : null,
  });
  // Цель «book_created» — для всех книг; для автобиографии и своей книги — ещё и «book_created_<вид>» (queueEvent
  // пока без свойств, поэтому вид кодируется именем цели; свойства события — зона сайта).
  await queueEvent("book_created");
  const kind = bookKind(d.theme);
  if (kind !== "gift") await queueEvent(`book_created_${kind}`);
  return lredirect(`/books/${book.id}`);
}
