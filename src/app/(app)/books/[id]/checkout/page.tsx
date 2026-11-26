import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GIFT_COOKIE, INVITE_COOKIE } from "@/shared/domain/orders";
import { Link } from "@/i18n/client";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { CircleAlert, Eye, TriangleAlert } from "lucide-react";
import { requireUser } from "@/web/auth";
import { getAccessibleBook } from "@/web/books";
import { v1WebRead } from "@/web/api";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { getFormat } from "@/lib/book/formats";
import { coverName, interiorName } from "@/i18n/labels";
import { coverPhotoRefs } from "@/lib/book/photo-refs";
import { CheckoutForm } from "./CheckoutForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).checkout.meta };
}

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ promo?: string; upgrade?: string }> }) {
  const { id } = await params;
  const { promo: promoParam, upgrade: upgradeParam } = await searchParams;
  const user = await requireUser(`/books/${id}/checkout`);
  const book = await getAccessibleBook(id, user);
  const [locale, m, jar] = await Promise.all([getLocale(), getMessages(), cookies()]);
  // Код активированного сертификата, персональный промокод из ссылки менеджера или приглашение друга подставляем сразу.
  const giftCode = jar.get(GIFT_COOKIE)?.value || (promoParam && /^[A-Za-z0-9-]{3,40}$/.test(promoParam) ? promoParam : undefined) || jar.get(INVITE_COOKIE)?.value;

  const page = await v1WebRead({
    name: "orders.checkoutPage",
    section: "orders",
    locale,
    viaApi: (api) => api.webCheckoutPage({ bookId: book.id, locale, promo: giftCode, upgrade: upgradeParam }),
  });

  if (page.closed || !page.data) return lredirect(`/books/${book.id}`);
  const d = page.data;
  const t = m.checkout;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center gap-4">
        <div className="w-12 shrink-0 sm:w-14">
          <CoverPreview
            template={book.coverTemplate}
            lines={book.coverLines}
            format={book.format}
            title={book.title}
            subtitle={book.subtitle}
            names={coverNames(book)}
            photos={coverPhotoRefs(coverPhotoIds(book), d.photos, book, "thumb")}
            design={book.coverDesign}
            lite
            className="rounded-[3px] shadow-book"
          />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-[30px] leading-tight font-medium sm:text-[36px]">{t.title}</h1>
          <p className="mt-0.5 text-sm text-muted">{t.summary(book.title, d.pageCount, d.answered, d.photosCount, d.exactPages)}</p>
          {/* Последний взгляд на оформление перед оплатой — с быстрым переходом к правке */}
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
            <Link href={`/books/${book.id}/cover`} className="underline-offset-2 hover:text-ink hover:underline">
              {t.design.cover(coverName(book.coverTemplate, locale))}
            </Link>
            <Link href={`/books/${book.id}/pages`} className="underline-offset-2 hover:text-ink hover:underline">
              {t.design.pages(interiorName(book.interior, locale))}
            </Link>
            <span>{getFormat(book.format).short}</span>
          </p>
        </div>
      </header>

      {d.staffView ? <p className="mt-5 rounded-[10px] bg-warning-bg px-4 py-3 text-sm text-warning">{t.staffView}</p> : null}

      {/* Проверка перед оплатой: макет и то, что стоит поправить */}
      <section className="panel mt-5 p-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-64 text-sm text-ink-soft">{t.checkPreview}</p>
          <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm shrink-0 max-sm:w-full">
            <Eye className="size-4" aria-hidden /> {t.openPreview}
          </Link>
        </div>
        {d.issues.length ? (
          <ul className="mt-3 space-y-2 border-t border-line pt-3">
            {d.issues.map((i) => (
              <li key={i.text} className={`flex items-start gap-2 text-sm ${i.level === "error" ? "text-danger" : "text-warning"}`}>
                {i.level === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <span>
                  {i.text}{" "}
                  {i.href ? (
                    <Link href={i.href} className="font-medium underline underline-offset-2">
                      {t.fix}
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="mt-6">
        <CheckoutForm
          bookId={book.id}
          blocked={d.blocked}
          initialPromo={d.initialPromo}
          initialPlan={d.initialPlan ?? undefined}
          upgrade={d.upgrade}
          agreement={d.agreement}
          defaults={d.defaults}
        />
      </div>
    </main>
  );
}
