import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GIFT_COOKIE } from "@/modules/ordering";
import { INVITE_COOKIE } from "@/modules/referrals";
import { container } from "@/server/container";
import { getPlan, type PlanId } from "@/config/site";
import type { PromoPreview } from "./actions";
import { getOccasion } from "@/lib/occasions";
import { Link } from "@/i18n/client";
import { getLocale, getMessages, lredirect } from "@/i18n/server";
import { CircleAlert, Eye, TriangleAlert } from "lucide-react";
import { requireUser } from "@/server/auth";
import { getAccessibleBook } from "@/server/books";
import { checkReadiness } from "@/modules/authoring/domain/readiness";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { getFormat } from "@/lib/book/formats";
import { coverName, interiorName } from "@/i18n/labels";
import { coverPhotoRefs } from "@/lib/book/photo-refs";
import { buildBookContent } from "@/lib/book/book-content";
import { toPhotoItem } from "@/lib/book/layout";
import { CheckoutForm } from "./CheckoutForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).checkout.meta };
}

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ promo?: string; upgrade?: string }> }) {
  const { id } = await params;
  const { promo: promoParam, upgrade: upgradeParam } = await searchParams;
  const user = await requireUser(`/books/${id}/checkout`);
  const book = await getAccessibleBook(id, user);
  // Книга уже заказана — оформлять можно только печатную версию к оплаченной электронной (?upgrade=<номер заказа>).
  const upgrade = upgradeParam && /^[0-9a-f-]{36}$/i.test(upgradeParam) ? await container().ordering.orders.upgradeOffer(upgradeParam, user.id) : null;
  const upgradeOk = !!upgrade && upgrade.bookId === book.id;
  if (book.status !== "draft" && !upgradeOk) return lredirect(`/books/${book.id}`);
  const q = container().authoring.queries;
  const [stats, photos, questions, chapters, letters, locale, m, built] = await Promise.all([
    q.stats(book),
    q.photos(book.id),
    q.questions(book.id),
    q.chapters(book.id),
    q.approvedLetters(book.id),
    getLocale(),
    getMessages(),
    // Готовый макет — точное число страниц, то же, что в предпросмотре рядом; нет (макет не открывали) — оценка.
    container().previews.current(book.id).catch(() => null),
  ]);
  const t = m.checkout;
  // Сборка книги, как у PDF (оформление, формат, оглавление, правила раскладки, места и кадры фото): по ней —
  // предупреждения о главах без фото в оформлении с фото главы и о сильной обрезке фото.
  const content = buildBookContent(book, questions, photos.map(toPhotoItem), chapters, undefined, letters);
  const issues = checkReadiness(book, built ? { ...stats, estimatedPages: built.contentPages } : stats, photos, locale, content);
  const blocked = issues.some((i) => i.level === "error");
  // Код активированного сертификата, персональный промокод из ссылки менеджера или приглашение друга подставляем сразу.
  const jar = await cookies();
  const giftCode = jar.get(GIFT_COOKIE)?.value || (promoParam && /^[A-Za-z0-9-]{3,40}$/.test(promoParam) ? promoParam : undefined) || jar.get(INVITE_COOKIE)?.value;
  const ordering = container().ordering;
  // Договорённость с менеджером (ручная сделка): клиент выбирает — продолжить по ней или оформить заказ с нуля.
  // Смотрит сотрудник — договорённость берём у владельца книги, а не у сотрудника: он видит ровно то, что увидит клиент.
  const agreement = upgradeOk ? null : await ordering.orders.agreementFor(book.userId);
  const staffView = book.userId !== user.id;
  const giftCheck = giftCode ? await ordering.promos.check(giftCode, user.id) : null;
  const initialPromo: PromoPreview | null = giftCheck?.ok ? { ok: true, code: giftCheck.promo.code, kind: giftCheck.promo.kind, value: giftCheck.promo.value, label: giftCheck.promo.label } : null;
  // Сертификат на конкретный тариф — открываем заказ сразу с ним, чтобы номинал использовался полностью.
  const giftPlan = giftCheck?.ok ? ((await ordering.queries.giftByPromo(giftCheck.promo.id))?.plan as PlanId | undefined) : undefined;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center gap-4">
        <div className="w-12 shrink-0 sm:w-14">
          <CoverPreview
            template={book.coverTemplate}
            format={book.format}
            title={book.title}
            subtitle={book.subtitle}
            names={coverNames(book)}
            photos={coverPhotoRefs(coverPhotoIds(book), photos, book, "thumb")}
            design={book.coverDesign}
            lite
            className="rounded-[3px] shadow-book"
          />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-[30px] leading-tight font-medium sm:text-[36px]">{t.title}</h1>
          <p className="mt-0.5 text-sm text-muted">{t.summary(book.title, built?.pageCount ?? stats.printedPages, stats.answered, stats.photos, !!built)}</p>
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

      {staffView ? <p className="mt-5 rounded-[10px] bg-warning-bg px-4 py-3 text-sm text-warning">{t.staffView}</p> : null}

      {/* Проверка перед оплатой: макет и то, что стоит поправить */}
      <section className="panel mt-5 p-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-64 text-sm text-ink-soft">{t.checkPreview}</p>
          <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm shrink-0 max-sm:w-full">
            <Eye className="size-4" aria-hidden /> {t.openPreview}
          </Link>
        </div>
        {issues.length ? (
          <ul className="mt-3 space-y-2 border-t border-line pt-3">
            {issues.map((i) => (
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
          blocked={blocked}
          initialPromo={initialPromo}
          initialPlan={giftPlan}
          upgrade={upgradeOk ? { orderId: upgrade.orderId, number: upgrade.number, credit: upgrade.credit } : null}
          agreement={agreement && { dealNumber: agreement.dealNumber, agreedTotal: agreement.agreedTotal, prepaid: agreement.prepaid, batch: agreement.batch && !agreement.batch.implicit ? { index: agreement.batch.index, size: agreement.batch.size } : null, plan: agreement.plan && getPlan(agreement.plan) ? (agreement.plan as PlanId) : null, gifts: agreement.gifts ?? [] }}
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
