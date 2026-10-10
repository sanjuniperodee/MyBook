import { Link } from "@/i18n/client";
import { ArrowRight, Check, Circle } from "lucide-react";
import { formatPrice, site } from "@/config/site";
import { formatDate } from "@/lib/utils";
import { getLocale, getMessages } from "@/i18n/server";
import type { DealAgreement } from "@/modules/sales";

/** С какого числа ответов книга считается готовой к заказу (подсказка клиенту, не запрет). */
const READY_ANSWERS = 10;

export interface CardBook {
  id: string;
  status: string;
  answered: number;
}

/** Куда вести клиента дальше: черновик с наибольшим числом ответов, а если книги нет — на создание. */
export function agreementStep(books: CardBook[]) {
  const drafts = books.filter((b) => b.status === "draft").sort((a, b) => b.answered - a.answered);
  const best = drafts[0];
  if (!best) return { kind: "start" as const };
  return best.answered >= READY_ANSWERS ? { kind: "order" as const, bookId: best.id, answered: best.answered } : { kind: "write" as const, bookId: best.id, answered: best.answered };
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
        ? { href: `/books/${step.bookId}`, label: t.write(step.answered), hint: t.writeHint }
        : { href: `/books/${step.bookId}/checkout`, label: t.order(left > 0 ? formatPrice(left) : "0"), hint: t.orderHint };
  const progress = [
    { label: t.steps.prepaid, done: agreement.prepaid > 0 },
    { label: t.steps.book, done: step.kind === "order" },
    { label: t.steps.order, done: false },
    { label: t.steps.print, done: false },
  ];
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:p-6" data-testid="agreement-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold text-emerald-950">{t.title}</h2>
        <span className="text-xs text-emerald-900/80">
          {t.deal(agreement.dealNumber)}
          {agreement.deadline ? ` · ${t.deadline(formatDate(new Date(`${agreement.deadline}T12:00:00`), false, locale))}` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-emerald-900">{agreement.prepaid > 0 ? t.hasPrepaid : t.noPrepaid}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white/70 px-4 py-3">
          <dt className="text-xs text-emerald-900/80">{t.price}</dt>
          <dd className="mt-0.5 text-lg font-semibold text-emerald-950">{formatPrice(agreement.agreedTotal)}</dd>
        </div>
        <div className="rounded-xl bg-white/70 px-4 py-3">
          <dt className="text-xs text-emerald-900/80">{t.paid}</dt>
          <dd className="mt-0.5 text-lg font-semibold text-emerald-950">{formatPrice(agreement.prepaid)}</dd>
        </div>
        <div className="rounded-xl bg-white/70 px-4 py-3">
          <dt className="text-xs text-emerald-900/80">{t.left}</dt>
          <dd className="mt-0.5 text-lg font-semibold text-emerald-950">{formatPrice(left)}</dd>
        </div>
      </dl>
      <ol className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-emerald-900">
        {progress.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            {p.done ? <Check className="size-3.5 text-emerald-700" /> : <Circle className="size-3 text-emerald-700/50" />}
            <span className={p.done ? "font-medium" : undefined}>{p.label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href={cta.href} className="btn btn-primary">
          {cta.label} <ArrowRight className="size-4" />
        </Link>
        <p className="min-w-0 flex-1 basis-60 text-xs text-emerald-900">{cta.hint}</p>
      </div>
      {agreement.prepaid > 0 ? (
        <p className="mt-4 border-t border-emerald-200/70 pt-3 text-xs text-emerald-900">
          {t.keep} {t.refund}{" "}
          <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            {t.refundLink}
          </a>
        </p>
      ) : null}
    </section>
  );
}
