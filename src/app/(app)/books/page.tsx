import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { CalendarHeart, Plus } from "lucide-react";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { getTheme } from "@/lib/content/themes";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { OpenBookArt } from "@/components/illustrations";
import { Morph } from "@/components/motion/PageTransition";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { formatDate, nowMs } from "@/lib/utils";
import { deadlineFor, getOccasion } from "@/lib/occasions";
import { getLocale, getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).books.list.meta };
}

export default async function BooksPage() {
  const user = await requireUser("/books");
  const [rows, locale, m] = await Promise.all([container().authoring.queries.userBooks(user.id), getLocale(), getMessages()]);
  const t = m.books.list;
  const now = new Date(nowMs());
  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6 sm:py-20">
        <OpenBookArt className="enter mx-auto h-44 w-auto sm:h-52" />
        <h1 style={{ "--i": 1 } as React.CSSProperties} className="enter mt-6 font-serif text-4xl font-medium sm:text-5xl">
          {t.hello(user.name)}
        </h1>
        <p style={{ "--i": 2 } as React.CSSProperties} className="enter mx-auto mt-4 max-w-lg text-lg text-muted">
          {t.firstText}
        </p>
        <div style={{ "--i": 3 } as React.CSSProperties} className="enter mt-10 flex flex-col items-center gap-3">
          <Link href="/books/new" className="btn btn-primary btn-lg">
            <Plus className="size-5" /> {t.create}
          </Link>
          <Link href="/redeem" className="text-sm text-muted underline-offset-4 hover:text-wine hover:underline">
            {t.haveGift}
          </Link>
        </div>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
          <p className="mt-2 text-muted">{t.autosave}</p>
        </div>
        <Link href="/books/new" className="btn btn-primary">
          <Plus className="size-4" /> {t.newBook}
        </Link>
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ book, answered, total, photos }) => {
          const theme = getTheme(book.theme, locale);
          const progress = total ? Math.round((answered / total) * 100) : 0;
          return (
            <Link key={book.id} href={`/books/${book.id}`} className="card card-hover group flex gap-5 p-5">
              <div className="w-28 shrink-0">
                <Morph name={`cover-${book.id}`}>
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
                </Morph>
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="text-xs font-medium text-wine">{theme.name}</div>
                <h2 className="mt-1 truncate font-serif text-2xl font-medium">{book.title}</h2>
                <div className="mt-1 text-sm text-muted">{book.status === "ordered" ? t.ordered : t.writing}</div>
                {(() => {
                  const o = getOccasion(book.occasion);
                  if (book.status !== "draft" || !o || !book.occasionDate) return null;
                  const dl = deadlineFor(book.occasionDate, now);
                  if (dl.state === "past") return null;
                  return (
                    <div className={`mt-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${dl.state === "relaxed" ? "bg-cream text-ink-soft" : "bg-rose/60 text-wine"}`}>
                      <CalendarHeart className="size-3.5" />
                      {m.common.deadline.chip(m.common.occasions[o.id].label, dl.daysToTarget)}
                      {dl.state === "relaxed" || dl.state === "soon" || dl.state === "urgent" ? m.common.deadline.chipOrderBy(dl.orderBy) : ""}
                    </div>
                  );
                })()}
                <div className="mt-auto pt-4">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{t.answered(answered, total)}</span>
                    <span>{t.photos(photos)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-cream">
                    <div className="bar-grow h-full rounded-full bg-wine" style={{ width: `${Math.max(progress, 2)}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-muted">{t.updated(formatDate(book.updatedAt, false, locale))}</div>
                </div>
              </div>
            </Link>
          );
        })}
        <Link href="/books/new" className="group flex min-h-44 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line text-muted transition hover:border-wine/40 hover:bg-white/60 hover:text-wine">
          <span className="flex size-12 items-center justify-center rounded-full bg-white shadow-soft transition group-hover:scale-110">
            <Plus className="size-5" />
          </span>
          <span className="text-sm font-medium">{t.newBookHint}</span>
        </Link>
      </div>
    </main>
  );
}
