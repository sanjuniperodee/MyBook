import type { Metadata } from "next";
import { Package } from "lucide-react";
import { Link } from "@/i18n/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { planName } from "@/i18n/labels";
import { orderStatusColors, orderStatusLabel, isPrintedPlan } from "@/modules/ordering/ui/status";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { AgreementCard } from "@/components/AgreementCard";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNames } from "@/lib/book/cover-names";
import { coverPhotoIds } from "@/lib/book/covers";
import { photoUrls } from "@/lib/urls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.list.meta };
}

/** Заказы автора: строка — мини-обложка, книга и номер, статус словами и сумма; на телефоне статус и сумма под названием. */
export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const [list, locale, m, agreement] = await Promise.all([container().ordering.queries.userOrders(user.id), getLocale(), getMessages(), container().ordering.orders.agreementFor(user.id)]);
  // Заказа ещё нет, но есть договорённость с менеджером: показываем «бронь» вместо пустого списка.
  const books = agreement ? await container().authoring.queries.userBooks(user.id) : [];
  const t = m.orders.list;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
      {agreement ? (
        <div className="mt-8">
          <AgreementCard agreement={agreement} books={books.map((r) => ({ id: r.book.id, status: r.book.status, theme: r.book.theme, answered: r.answered, total: r.total, words: r.words }))} />
        </div>
      ) : null}
      {list.length === 0 && agreement ? null : list.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-dashed border-line-strong bg-white/50">
          <EmptyState
            icon={Package}
            title={t.empty}
            action={
              <Link href="/books" className="btn btn-primary">
                {t.toBooks}
              </Link>
            }
          >
            {t.emptyText}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white">
          {list.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-sunken/60 sm:px-5">
                <div className="w-11 shrink-0 sm:w-12">
                  <CoverPreview
                    template={o.book.coverTemplate}
                    format={o.book.format}
                    title={o.book.title}
                    names={coverNames(o.book)}
                    photos={photoUrls(coverPhotoIds(o.book), "thumb")}
                    design={o.book.coverDesign}
                    lite
                    className="rounded-[2px] shadow-sm"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-xl leading-tight font-medium">{o.book.title}</div>
                  <div className="mt-0.5 text-sm text-muted">
                    {t.number(o.number)}, {formatDate(o.createdAt, false, locale)}
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {planName(o.plan, locale)}
                    {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                  </div>
                  <span className={cn("badge mt-2 sm:hidden", orderStatusColors[o.status])}>{orderStatusLabel(o.status, locale, isPrintedPlan(o.plan))}</span>
                </div>
                <span className={cn("badge shrink-0 max-sm:hidden", orderStatusColors[o.status])}>{orderStatusLabel(o.status, locale, isPrintedPlan(o.plan))}</span>
                <span className="shrink-0 text-right font-medium tabular-nums sm:w-28">{formatPrice(o.amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
