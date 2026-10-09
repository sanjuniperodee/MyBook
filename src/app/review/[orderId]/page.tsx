import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine, getCoverTemplate } from "@/lib/book/covers";
import { container } from "@/server/container";
import { reviewAccess } from "@/server/reviews";
import { FeedbackError, THANK_YOU } from "@/modules/feedback";
import { getMessages } from "@/i18n/server";
import { ReviewForm } from "./ReviewForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).review.meta, robots: { index: false } };
}

/** Отзыв о книге — по ссылке из письма (без входа) или из заказа в кабинете. */
export default async function ReviewPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ orderId }, { t: token }] = await Promise.all([params, searchParams]);
  if (!(await reviewAccess(orderId, token))) notFound();
  const m = await getMessages();
  const t = m.review;
  const details = await container().ordering.queries.orderDetails(orderId);
  if (!details) notFound();
  const book = details.book;

  let state: Awaited<ReturnType<ReturnType<typeof container>["feedback"]["reviews"]["open"]>> | null = null;
  try {
    state = await container().feedback.reviews.open(orderId);
  } catch (err) {
    if (!FeedbackError.is(err)) throw err;
  }
  const review = state?.review?.snapshot() ?? null;
  // Ссылка из письма работает без входа, а фото книги отдаются только владельцу в кабинете — поэтому шаблон без фото.
  const template = getCoverTemplate(book.coverTemplate).requiresPhoto ? "linen" : book.coverTemplate;

  return (
    <div className="min-h-dvh bg-[radial-gradient(60%_40%_at_50%_0%,#f4e4df,transparent)]">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Logo />
        <LanguageSwitch />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
          <div className="w-28 shrink-0 rotate-[-4deg]">
            <CoverPreview
              template={template}
              format={book.format}
              title={book.title}
              names={coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover)}
              lite
              className="rounded-[3px] shadow-book"
            />
          </div>
          <div>
            <div className="eyebrow">{t.order(details.number)}</div>
            <h1 className="mt-2 font-serif text-4xl leading-tight font-medium sm:text-5xl">{t.title}</h1>
            <p className="mt-3 text-lg text-muted">{t.subtitle}</p>
          </div>
        </div>
        <div className="mt-10">
          {!state ? (
            <div className="card p-8 text-center text-muted">{t.notYet}</div>
          ) : (
            <ReviewForm
              orderId={orderId}
              token={token ?? null}
              defaultName={state.order.name}
              thankYou={THANK_YOU}
              initial={
                review
                  ? {
                      rating: review.rating,
                      text: review.text,
                      authorName: review.authorName,
                      city: review.city,
                      consent: review.consent,
                      hasPhoto: !!review.photo,
                      status: review.status,
                      thankYouCode: review.thankYouCode,
                    }
                  : null
              }
            />
          )}
        </div>
      </main>
    </div>
  );
}
