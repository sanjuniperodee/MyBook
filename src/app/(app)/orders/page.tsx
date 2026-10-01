import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { EmptyState, GiftArt } from "@/components/illustrations";
import { requireUser } from "@/lib/auth";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { planName } from "@/i18n/labels";
import { orderStatusColors, orderStatusLabel } from "@/modules/ordering/ui/status";
import { cn, formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.list.meta };
}

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const [list, locale, m] = await Promise.all([container().ordering.queries.userOrders(user.id), getLocale(), getMessages()]);
  const t = m.orders.list;
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title}</h1>
      {list.length === 0 ? (
        <div className="card mt-10">
          <EmptyState
            art={GiftArt}
            title={t.empty}
            text={t.emptyText}
            action={<Link href="/books" className="btn btn-primary">{t.toBooks}</Link>}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {list.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card card-hover flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.item(o.number, o.book.title)}</div>
                <div className="text-sm text-muted">
                  {formatDate(o.createdAt, false, locale)} · {planName(o.plan, locale)}
                  {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                </div>
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs font-medium", orderStatusColors[o.status])}>{orderStatusLabel(o.status, locale)}</span>
              <span className="w-28 text-right font-medium">{formatPrice(o.amount)}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
