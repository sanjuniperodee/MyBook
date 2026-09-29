import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, TriangleAlert, CircleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook, getBookPhotos, getBookStats } from "@/lib/books";
import { checkReadiness } from "@/lib/readiness";
import { BackLink } from "@/components/BackLink";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { pluralRu } from "@/lib/book/layout";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Оформление заказа" };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/books/${id}/checkout`);
  const book = await getAccessibleBook(id, user);
  if (book.status !== "draft") redirect(`/books/${book.id}`);
  const [stats, photos] = await Promise.all([getBookStats(book), getBookPhotos(book.id)]);
  const issues = checkReadiness(book, stats, photos);
  const blocked = issues.some((i) => i.level === "error");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <BackLink href={`/books/${book.id}`}>К книге</BackLink>
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="w-24 shrink-0">
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
        <div>
          <h1 className="font-serif text-4xl font-medium sm:text-5xl">Оформление заказа</h1>
          <p className="mt-2 text-muted">
            «{book.title}» · ≈ {stats.printedPages} {pluralRu(stats.printedPages, "страница", "страницы", "страниц")} · {stats.answered} ответов · {stats.photos} фото
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Перед заказом обязательно пролистайте готовый макет — книга будет напечатана именно так.</p>
          <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm">
            Открыть предпросмотр <ArrowRight className="size-4" />
          </Link>
        </div>
        {issues.length ? (
          <ul className="mt-4 space-y-2 border-t border-line pt-4">
            {issues.map((i) => (
              <li key={i.text} className={`flex items-start gap-2 text-sm ${i.level === "error" ? "text-red-700" : "text-amber-800"}`}>
                {i.level === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
                <span>
                  {i.text}{" "}
                  {i.href ? (
                    <Link href={i.href} className="underline underline-offset-2">
                      Исправить
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-10">
        <CheckoutForm bookId={book.id} blocked={blocked} defaults={{ name: user.name, email: user.email, phone: user.phone ?? "" }} />
      </div>
    </main>
  );
}
