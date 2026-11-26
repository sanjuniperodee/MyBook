import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlainSheet, PlainShell } from "@/components/landing/PlainShell";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { getCoverTemplate } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { ApiClientError } from "@mybook/contracts";
import { THANK_YOU } from "@/shared/domain/reviews";
import { localReviewPage } from "@/server/v1-local-bridge-public";
import { v1WebRead } from "@/server/v1-web-client";
import { getMessages } from "@/i18n/server";
import { bookKind } from "@/lib/content/kinds";
import { ReviewForm } from "./ReviewForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).review.meta, robots: { index: false } };
}

/** Отзыв о книге — по ссылке из письма (без входа) или из заказа в кабинете. */
export default async function ReviewPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ orderId }, { t: token }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) notFound();
  // Доступ (подпись ссылки или владелец заказа) и данные страницы — через API v1 (Раздел 4).
  const page = await v1WebRead({
    name: "public.reviewPage",
    section: "public",
    local: () => localReviewPage(orderId, token ?? null),
    viaApi: async (api) => {
      try {
        return await api.webReviewPage({ orderId, ...(token ? { t: token } : {}) });
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) return null;
        throw err;
      }
    },
  });
  if (!page) notFound();
  const m = await getMessages();
  const t = m.review;
  const details = page;
  const book = page.book;
  const state = page.state;
  const review = state?.review ?? null;
  // Ссылка из письма работает без входа, а фото книги отдаются только владельцу в кабинете — поэтому шаблон без фото.
  const template = getCoverTemplate(book.coverTemplate).requiresPhoto ? "linen" : book.coverTemplate;

  const cover = <CoverPreview template={template} lines={book.coverLines} format={book.format} title={book.title} names={coverNames(book)} lite className="rounded-[3px] shadow-book" />;

  return (
    <PlainShell size="lg">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        {/* Слева — книга и вопрос: на ноутбуке липко, на телефоне — маленькая обложка рядом с титром. */}
        <header className="flex items-start gap-5 lg:sticky lg:top-8 lg:block lg:self-start">
          <div className="w-20 shrink-0 sm:w-24 lg:w-44">{cover}</div>
          <div className="min-w-0 lg:mt-7">
            <div className="text-sm text-muted">{t.order(details.number)}</div>
            <h1 className="mt-1.5 font-serif text-[34px] leading-[1.05] font-medium text-balance sm:text-[44px] lg:text-[40px]">{t.title}</h1>
            <p className="mt-3 hidden leading-relaxed text-ink-soft sm:block">{t.subtitle}</p>
          </div>
        </header>
        <div className="mt-6 min-w-0 lg:mt-0">
          <p className="mb-6 leading-relaxed text-ink-soft sm:hidden">{t.subtitle}</p>
          <PlainSheet>
            {!state ? (
              <p className="py-6 text-center text-muted">{t.notYet}</p>
            ) : (
              <ReviewForm
                orderId={orderId}
                token={token ?? null}
                defaultName={state.defaultName}
                thankYou={THANK_YOU}
                kind={bookKind(book.theme)}
                initial={review}
              />
            )}
          </PlainSheet>
        </div>
      </div>
    </PlainShell>
  );
}
