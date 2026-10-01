import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GIFT_COOKIE } from "@/modules/ordering";
import { container } from "@/server/container";
import type { PlanId } from "@/config/site";
import type { PromoPreview } from "./actions";
import { getOccasion } from "@/lib/occasions";
import { Link } from "@/i18n/client";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { ArrowRight, TriangleAlert, CircleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getAccessibleBook, getBookPhotos, getBookStats } from "@/lib/books";
import { checkReadiness } from "@/lib/readiness";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { CheckoutForm } from "./CheckoutForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).checkout.meta };
}

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ promo?: string }> }) {
  const { id } = await params;
  const { promo: promoParam } = await searchParams;
  const user = await requireUser(`/books/${id}/checkout`);
  const book = await getAccessibleBook(id, user);
  if (book.status !== "draft") return lredirect(`/books/${book.id}`);
  const [stats, photos, locale, m] = await Promise.all([getBookStats(book), getBookPhotos(book.id), getLocale(), getMessages()]);
  const t = m.checkout;
  const issues = checkReadiness(book, stats, photos, locale);
  const blocked = issues.some((i) => i.level === "error");
  // Код активированного сертификата (или персональный промокод из ссылки менеджера) подставляем сразу.
  const giftCode = (await cookies()).get(GIFT_COOKIE)?.value || (promoParam && /^[A-Za-z0-9-]{3,40}$/.test(promoParam) ? promoParam : undefined);
  const ordering = container().ordering;
  const giftCheck = giftCode ? await ordering.promos.check(giftCode) : null;
  const initialPromo: PromoPreview | null = giftCheck?.ok ? { ok: true, code: giftCheck.promo.code, kind: giftCheck.promo.kind, value: giftCheck.promo.value, label: giftCheck.promo.label } : null;
  // Сертификат на конкретный тариф — открываем заказ сразу с ним, чтобы номинал использовался полностью.
  const giftPlan = giftCheck?.ok ? ((await ordering.queries.giftByPromo(giftCheck.promo.id))?.plan as PlanId | undefined) : undefined;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
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
          <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
          <p className="mt-2 text-muted">{t.summary(book.title, stats.printedPages, stats.answered, stats.photos)}</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t.checkPreview}</p>
          <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm">
            {t.openPreview} <ArrowRight className="size-4" />
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
                      {t.fix}
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-10">
        <CheckoutForm
          bookId={book.id}
          blocked={blocked}
          initialPromo={initialPromo}
          initialPlan={giftPlan}
          defaults={{
            name: user.name,
            email: user.email,
            phone: user.phone ?? "",
            desiredDate: book.occasionDate,
            occasionLabel: (() => {
              const o = getOccasion(book.occasion);
              return o ? m.common.occasions[o.id].label : null;
            })(),
          }}
        />
      </div>
    </main>
  );
}
