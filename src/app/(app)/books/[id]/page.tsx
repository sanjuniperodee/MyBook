import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, BookOpen, Camera, Eye, FileText, MessageCircle, Palette, Settings2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { firstUnansweredIndex, getAccessibleBook, getBookPhotos, getBookQuestions, getBookStats } from "@/lib/books";
import { getTheme } from "@/lib/content/themes";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { pluralRu } from "@/lib/book/layout";
import { print } from "@/lib/book/formats";
import { getTypography } from "@/lib/book/fonts";
import { getFormat } from "@/lib/book/formats";
import { site } from "@/config/site";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { orderStatusLabel } from "@/lib/orders-shared";
import { BookMenu } from "./BookMenu";

export const metadata: Metadata = { title: "Книга" };

export default async function BookHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}`);
  const book = await getAccessibleBook(id, user);
  const [stats, questions, photos, [order]] = await Promise.all([
    getBookStats(book),
    getBookQuestions(book.id),
    getBookPhotos(book.id),
    db.select().from(orders).where(eq(orders.bookId, book.id)).orderBy(desc(orders.createdAt)).limit(1),
  ]);
  const theme = getTheme(book.theme);
  const progress = stats.total ? stats.answered / stats.total : 0;
  const continueIndex = firstUnansweredIndex(questions);
  const editable = book.status === "draft";
  const minPages = print.minPages;
  const initial = (book.authorName || user.name || user.email).trim().charAt(0).toUpperCase();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Шапка */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-ink font-serif text-2xl text-white">{initial}</div>
          <div>
            <div className="text-lg font-semibold">{book.title}</div>
            <div className="text-sm text-muted">
              {theme.name} · {editable ? "Книга пишется" : order ? orderStatusLabel(order.status) : "Передана в печать"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editable ? (
            <Link href={`/books/${book.id}/checkout`} className="btn btn-primary">
              Завершить и заказать
            </Link>
          ) : order ? (
            <Link href={`/orders/${order.id}`} className="btn btn-primary">
              Заказ №{order.number}
            </Link>
          ) : null}
          <BookMenu bookId={book.id} editable={editable} />
        </div>
      </div>

      {/* Прогресс */}
      <section className="card mt-8 overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-6xl leading-none font-medium">{stats.printedPages}</span>
              <span className="text-lg text-muted">{pluralRu(stats.printedPages, "страница", "страницы", "страниц")} в книге</span>
            </div>
            <p className="mt-3 text-sm text-muted">
              {stats.answered} из {stats.total} ответов · {stats.words} {pluralRu(stats.words, "слово", "слова", "слов")} · {stats.photos} фото
              {stats.estimatedPages < minPages ? ` · минимальный объём книги ${minPages} стр., недостающие будут чистыми` : ""}
            </p>
          </div>
          {editable ? (
            <Link href={`/books/${book.id}/questions?q=${continueIndex + 1}`} className="btn btn-dark btn-lg">
              {stats.answered ? "Продолжить писать" : "Начать писать"} <ArrowRight className="size-5" />
            </Link>
          ) : null}
        </div>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-cream">
          <div className="h-full rounded-full bg-gradient-to-r from-wine to-[#b0475a] transition-all" style={{ width: `${Math.max(progress * 100, 1.5)}%` }} />
        </div>
      </section>

      {/* Разделы */}
      <section className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Link href={`/books/${book.id}/cover`} className="card group relative flex min-h-64 flex-col overflow-hidden p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
          <div className="absolute top-5 right-5 w-24 rotate-3 transition group-hover:rotate-0">
            <CoverPreview
              template={book.coverTemplate}
              format={book.format}
              title={book.title}
              subtitle={book.subtitle}
              names={coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover)}
              photoUrl={book.coverPhotoId ? photoUrl(book.coverPhotoId) : undefined}
              lite
              className="rounded-[3px] shadow-book"
            />
          </div>
          <Palette className="size-7 text-ink" strokeWidth={1.6} />
          <div className="mt-auto">
            <div className="text-lg font-semibold">Обложка</div>
            <div className="text-sm text-muted">{book.title}</div>
          </div>
        </Link>

        <Link href={`/books/${book.id}/questions?q=${continueIndex + 1}`} className="card group flex min-h-64 flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
          <FileText className="size-7" strokeWidth={1.6} />
          <div className="mt-auto">
            <div className="text-lg font-semibold">Ответы</div>
            <div className="mt-1 font-serif text-4xl font-medium">
              {stats.answered} <span className="text-muted">/ {stats.total}</span>
            </div>
          </div>
        </Link>

        <Link href={`/books/${book.id}/photos`} className="card group flex min-h-64 flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift">
          {photos.length ? (
            <div className="grid h-32 grid-cols-3 gap-0.5">
              {photos.slice(0, 3).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={photoUrl(p.id)} alt="" className="h-full w-full object-cover" />
              ))}
            </div>
          ) : null}
          <div className="flex flex-1 flex-col p-6">
            <Camera className="size-7" strokeWidth={1.6} />
            <div className="mt-auto">
              <div className="text-lg font-semibold">Фотографии</div>
              <div className="mt-1 font-serif text-4xl font-medium">{photos.length}</div>
            </div>
          </div>
        </Link>

        <Link href={`/books/${book.id}/settings`} className="card group flex min-h-52 flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
          <Settings2 className="size-7" strokeWidth={1.6} />
          <div className="mt-auto">
            <div className="text-lg font-semibold">Оформление</div>
            <div className="text-sm text-muted">
              {getFormat(book.format).short} · {getTypography(book.typography).name} · посвящение
            </div>
          </div>
        </Link>

        <Link href={`/books/${book.id}/preview`} className="card group flex min-h-52 flex-col bg-ink p-6 text-white transition hover:-translate-y-0.5 hover:shadow-lift">
          <Eye className="size-7" strokeWidth={1.6} />
          <div className="mt-auto">
            <div className="text-lg font-semibold">Предпросмотр книги</div>
            <div className="text-sm text-white/60">Листайте готовый макет страниц</div>
          </div>
        </Link>

        <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="card group flex min-h-52 flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
          <MessageCircle className="size-7" strokeWidth={1.6} />
          <div className="mt-auto">
            <div className="text-lg font-semibold">Поддержка</div>
            <div className="text-sm text-muted">Напишите нам — поможем с книгой</div>
          </div>
        </a>
      </section>

      {!editable ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-muted">
          <BookOpen className="size-4" /> Книга передана в печать, поэтому редактирование закрыто. Если нужно что-то поправить — напишите в поддержку.
        </p>
      ) : null}
    </main>
  );
}
