import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, GiftArt } from "@/components/illustrations";
import { requireUser } from "@/lib/auth";
import { listUserOrders } from "@/lib/orders";
import { formatPrice, getPlan } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Мои заказы" };

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const list = await listUserOrders(user.id);
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="font-serif text-4xl font-medium sm:text-5xl">Мои заказы</h1>
      {list.length === 0 ? (
        <div className="card mt-10">
          <EmptyState
            art={GiftArt}
            title="Заказов пока нет"
            text="Когда книга будет готова, пролистайте макет и нажмите «Заказать книгу» — заказ появится здесь со всеми статусами."
            action={<Link href="/books" className="btn btn-primary">К моим книгам</Link>}
          />
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {list.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card card-hover flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Заказ №{o.number} · {o.book.title}</div>
                <div className="text-sm text-muted">
                  {formatDate(o.createdAt)} · {getPlan(o.plan)?.name}
                  {o.quantity > 1 ? ` × ${o.quantity}` : ""}
                </div>
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs font-medium", orderStatusColors[o.status])}>{orderStatusLabel(o.status)}</span>
              <span className="w-28 text-right font-medium">{formatPrice(o.amount)}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
