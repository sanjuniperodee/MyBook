"use server";

import { ApiClientError } from "@mybook/contracts";
import { isLocale } from "@/i18n/config";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { requireUser } from "@/web/auth";
import { queueEvent } from "@/web/track";
import { bookKind } from "@/lib/content/kinds";
import { createBookSchema } from "@/lib/book/create-book-schema";
import { v1WebAction } from "@/web/api";

export interface CreateState {
  error?: string;
}

export async function createBookAction(_: CreateState, form: FormData): Promise<CreateState> {
  await requireUser();
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const parsed = createBookSchema(m.books.wizard.errors).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const outcome = await v1WebAction({
    section: "cabinet",
    locale,
    viaApi: async (api): Promise<{ ok: true; id: string } | { ok: false; error: string }> => {
      try {
        const res = await api.webBookCreate({
          body: {
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
            occasion: d.occasion,
            occasionDate: d.occasionDate,
          },
        });
        return { ok: true, id: res.id };
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 400) return { ok: false, error: err.message };
        throw err;
      }
    },
  });
  if (!outcome.ok) return { error: outcome.error };
  // Цель «book_created» — для всех книг, со свойством «вид книги»; для автобиографии и своей книги — ещё и цель
  // «book_created_<вид>» (её удобно завести целью в Метрике).
  const kind = bookKind(d.theme);
  await queueEvent("book_created", undefined, { kind });
  if (kind !== "gift") await queueEvent(`book_created_${kind}`);
  return lredirect(`/books/${outcome.id}`);
}
