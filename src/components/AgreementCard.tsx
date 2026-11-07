import { Link } from "@/i18n/client";
import { Check, Circle, Gift } from "lucide-react";
import { formatPrice, site } from "@/config/site";
import { formatDate } from "@/lib/dates";
import { getLocale, getMessages } from "@/i18n/server";
import type { DealAgreement } from "@/modules/sales";
import { getPlan } from "@/config/site";
import { bookKind, progressOf } from "@/lib/content/kinds";

/** Книга клиента для карточки: тема (вид книги) и прогресс — как для progressOf. */
export interface CardBook {
  id: string;
  status: string;
  theme: string;
  answered: number;
  total: number;
  words: number;
}

/**
 * Куда вести клиента дальше: черновик, где написано больше всего, а если книги нет — на создание. Книга готова
 * к заказу (подсказка клиенту, не запрет) — по тому же порогу, что шаг «Текст» на хабе (progressOf): у книг
 * с вопросами — по ответам, у своей книги — по словам.
 */
function agreementStep(books: CardBook[]) {
  const drafts = books
    .filter((b) => b.status === "draft")
    .map((b) => ({ ...b, done: progressOf(bookKind(b.theme), b).textStepDone }))
    .sort((a, b) => Number(b.done) - Number(a.done) || b.answered - a.answered || b.words - a.words);
  const best = drafts[0];
  if (!best) return { kind: "start" as const };
  return best.done
    ? { kind: "order" as const, bookId: best.id }
    : { kind: "write" as const, bookId: best.id, answered: best.answered, words: best.words, byWords: bookKind(best.theme) === "blank" };
}

/**
 * «Заказ-бронь»: заказа на сайте ещё нет, но клиент уже договорился с менеджером и, возможно, внёс предоплату.
 * Карточка показывает, что уже оплачено, что осталось и какой следующий шаг — на списке книг, в заказах и в книге.
 */
export async function AgreementCard({ agreement, books }: { agreement: DealAgreement; books: CardBook[] }) {
  const [locale, m] = await Promise.all([getLocale(), getMessages()]);
  const t = m.books.agreementCard;
  const step = agreementStep(books);
  const left = Math.max(0, agreement.agreedTotal - agreement.prepaid);
  const cta =
    step.kind === "start"
      ? { href: "/books/new", label: t.start, hint: t.startHint }
      : step.kind === "write"
        ? { href: `/books/${step.bookId}`, label: step.byWords ? t.writeWords(step.words) : t.write(step.answered), hint: t.writeHint }
        : { href: `/books/${step.bookId}/checkout`, label: t.order(left > 0 ? formatPrice(left) : "0"), hint: t.orderHint };
  const progress = [
    { label: t.steps.prepaid, done: agreement.prepaid > 0 },
    { label: t.steps.book, done: step.kind === "order" },
    { label: t.steps.order, done: false },
    { label: t.steps.print, done: false },
  ];
  return (
    <section className="panel overflow-hidden" data-testid="agreement-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[15px] font-semibold">{t.title}</h2>
        <span className="text-xs text-muted">
          {t.deal(agreement.dealNumber)}
          {agreement.deadline ? `, ${t.deadline(formatDate(new Date(`${agreement.deadline}T12:00:00`), false, locale))}` : ""}
        </span>
      </header>
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-8">
        <div className="min-w-0">
          <p className="text-sm text-ink-soft">{agreement.prepaid > 0 ? t.hasPrepaid : t.noPrepaid}</p>
          {agreement.plan && getPlan(agreement.plan) ? <p className="mt-1 text-sm font-medium text-ink">{t.plan(m.common.plans[agreement.plan as "digital" | "hardcover" | "premium"].name)}</p> : null}
          {agreement.batch && agreement.batch.size > 1 ? (
            <div className="mt-3 rounded-[10px] bg-sunken px-4 py-2.5 text-sm text-ink" data-testid="agreement-batch">
              <div className="font-medium">{agreement.batch.implicit ? t.batch.titleLeft(agreement.batch.left) : t.batch.title(agreement.batch.size, agreement.batch.left)}</div>
              <div className="mt-0.5 text-xs text-ink-soft">{agreement.batch.implicit ? t.batch.nowNext(agreement.recipient ?? null) : t.batch.now(agreement.batch.index + 1, agreement.batch.size)}</div>
              <div className="mt-0.5 text-xs text-ink-soft">{t.batch.total(formatPrice(agreement.batch.agreedLeft), formatPrice(agreement.batch.prepaidLeft), formatPrice(Math.max(0, agreement.batch.agreedLeft - agreement.batch.prepaidLeft)))}</div>
            </div>
          ) : null}
          <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-[10px] border border-line">
            {[
              [t.price, agreement.agreedTotal],
              [t.paid, agreement.prepaid],
              [t.left, left],
            ].map(([label, value]) => (
              <div key={label as string} className="min-w-0 px-3 py-2.5 sm:px-4">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 truncate font-serif text-xl font-medium tabular-nums">{formatPrice(value as number)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">{t.extras}</p>
          {agreement.gifts?.length ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink" data-testid="agreement-card-gifts">
              <Gift className="size-4 shrink-0 text-success" aria-hidden /> {t.gifts(agreement.gifts.map((g) => m.common.agreementGifts[g]).join(", "))}
            </p>
          ) : null}
          <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-soft">
            {progress.map((p) => (
              <li key={p.label} className="inline-flex items-center gap-1.5">
                {p.done ? <Check className="size-3.5 text-success" aria-hidden /> : <Circle className="size-3 text-line-strong" aria-hidden />}
                <span className={p.done ? "font-medium" : undefined}>{p.label}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-2 lg:w-64">
          <Link href={cta.href} className="btn btn-primary max-sm:w-full">
            {cta.label}
          </Link>
          <p className="text-xs text-muted">{cta.hint}</p>
        </div>
      </div>
      {agreement.prepaid > 0 ? (
        <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">
          {t.keep} {t.refund}{" "}
          <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="font-medium text-wine underline">
            {t.refundLink}
          </a>
        </p>
      ) : null}
    </section>
  );
}
