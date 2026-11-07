import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlainIntro, PlainShell } from "@/components/landing/PlainShell";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { getCoverTemplate } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { container } from "@/server/container";
import { reviewAccess } from "@/server/reviews";
import { FeedbackError, THANK_YOU } from "@/modules/feedback";
import { getMessages } from "@/i18n/server";
import { bookKind } from "@/lib/content/kinds";
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
    <PlainShell>
      <PlainIntro
        cover={<CoverPreview template={template} format={book.format} title={book.title} names={coverNames(book)} lite className="rounded-[3px] shadow-book" />}
        label={t.order(details.number)}
        title={t.title}
        text={t.subtitle}
      />
      <div className="mt-10">
        {!state ? (
          <div className="rounded-[14px] border border-line bg-white p-8 text-center text-muted">{t.notYet}</div>
        ) : (
          <ReviewForm
            orderId={orderId}
            token={token ?? null}
            defaultName={state.order.name}
            thankYou={THANK_YOU}
            kind={bookKind(book.theme)}
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
    </PlainShell>
  );
}
