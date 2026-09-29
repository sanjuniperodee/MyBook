import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listUserBooks } from "@/lib/books";
import { getTheme } from "@/lib/content/themes";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Мои книги" };

export default async function BooksPage() {
  const user = await requireUser("/books");
  const rows = await listUserBooks(user.id);
  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="font-serif text-5xl font-medium">Здравствуйте{user.name ? `, ${user.name}` : ""}!</h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-muted">Давайте начнём вашу первую книгу. Это займёт меньше минуты — а дальше вы будете отвечать на вопросы в своём темпе.</p>
        <Link href="/books/new" className="btn btn-primary btn-lg mt-10">
          <Plus className="size-5" /> Создать книгу
        </Link>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-medium sm:text-5xl">Мои книги</h1>
          <p className="mt-2 text-muted">Все изменения сохраняются автоматически.</p>
        </div>
        <Link href="/books/new" className="btn btn-primary">
          <Plus className="size-4" /> Новая книга
        </Link>
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ book, answered, total, photos }) => {
          const theme = getTheme(book.theme);
          const progress = total ? Math.round((answered / total) * 100) : 0;
          return (
            <Link key={book.id} href={`/books/${book.id}`} className="card group flex gap-5 p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
              <div className="w-28 shrink-0">
                <CoverPreview
                  template={book.coverTemplate}
                  format={book.format}
                  title={book.title}
                  subtitle={book.subtitle}
                  names={coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover)}
                  photoUrl={book.coverPhotoId ? photoUrl(book.coverPhotoId, "thumb") : undefined}
                  lite
                  className="rounded-[3px] shadow-book"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="text-xs font-medium text-wine">{theme.name}</div>
                <h2 className="mt-1 truncate font-serif text-2xl font-medium">{book.title}</h2>
                <div className="mt-1 text-sm text-muted">{book.status === "ordered" ? "Заказ оформлен" : "Книга пишется"}</div>
                <div className="mt-auto pt-4">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{answered} из {total} ответов</span>
                    <span>{photos} фото</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
                    <div className="h-full rounded-full bg-wine" style={{ width: `${Math.max(progress, 2)}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-muted">Изменена {formatDate(book.updatedAt)}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
