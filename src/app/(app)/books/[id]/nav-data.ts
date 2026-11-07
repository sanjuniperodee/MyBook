import "server-only";
import type { BookRow } from "@/modules/authoring";
import { checkReadiness } from "@/modules/authoring/domain/readiness";
import { isPaid } from "@/modules/ordering/domain";
import { print } from "@/lib/book/formats";
import { bookKind } from "@/lib/content/kinds";
import type { Locale } from "@/i18n/config";
import { container } from "@/server/container";
import { bookNav, type BookNav } from "./book-nav";

/**
 * Состояние пути книги для ленты разделов: несколько лёгких запросов (счётчики ответов одним SQL, письма, последний
 * заказ) — без сборки макета и без списка фото. Тот же расчёт, что на обзоре книги (bookNav).
 */
export async function loadBookNav(book: BookRow, locale: Locale): Promise<BookNav> {
  const c = container();
  const [rows, letters, order] = await Promise.all([c.authoring.queries.userBooks(book.userId), c.authoring.queries.letters(book.id), c.ordering.queries.lastOrderOfBook(book.id)]);
  const row = rows.find((r) => r.book.id === book.id);
  const answered = row?.answered ?? 0;
  const total = row?.total ?? 0;
  const words = row?.words ?? 0;
  const photos = row?.photos ?? 0;
  // Готовность обложки — те же проверки, что перед заказом: только ошибки раздела «Обложка».
  const issues = checkReadiness(book, { answered, total, words, photos, estimatedPages: print.minPages, printedPages: print.minPages, emptyChapters: 0 }, [], locale);
  const coverReady = !issues.some((i) => i.level === "error" && i.href?.endsWith("/cover"));
  return bookNav({
    kind: bookKind(book.theme),
    answered,
    total,
    words,
    photos,
    letters: { approved: letters.filter((l) => l.status === "approved").length, pending: letters.filter((l) => l.status === "pending").length },
    coverReady,
    ordered: book.status !== "draft",
    paid: !!order && isPaid(order.status),
    order: order ? { id: order.id, number: order.number, status: order.status, plan: order.plan } : null,
  });
}
