import type { Metadata } from "next";
import { ChevronRight, Package } from "lucide-react";
import { Link } from "@/i18n/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { formatPrice } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { planName } from "@/i18n/labels";
import { orderStatusLabel, orderStatusTone, isPrintedPlan } from "@/modules/ordering/ui/status";
import { formatDate } from "@/lib/dates";
import { AgreementCard } from "@/components/AgreementCard";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNames } from "@/lib/book/cover-names";
import { coverPhotoIds } from "@/lib/book/covers";
import { photoUrls } from "@/lib/urls";
import { PageHead } from "../_components/PageHead";
import { nowKey, orderSteps, StatusTrack } from "./StatusTrack";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.list.meta };
}

/**
 * Заказы автора: каждый — лист с обложкой, суммой и линейкой статуса (оформлен, оплачен, печатается, в пути, доставлен),
 * под ней — что с заказом сейчас. Заказ, ждущий оплаты, получает главную кнопку «Перейти к оплате».
 */
export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const [list, locale, m, agreement] = await Promise.all([container().ordering.queries.userOrders(user.id), getLocale(), getMessages(), container().ordering.orders.agreementFor(user.id)]);
  // Заказа ещё нет, но есть договорённость с менеджером: показываем «бронь» вместо пустого списка.
  const books = agreement ? await container().authoring.queries.userBooks(user.id) : [];
  const t = m.orders.list;
  const o = m.orders.order;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHead title={t.title} lead={t.lead} />
      {agreement ? (
        <div className="mt-8">
          <AgreementCard agreement={agreement} books={books.map((r) => ({ id: r.book.id, status: r.book.status, theme: r.book.theme, answered: r.answered, total: r.total, words: r.words }))} />
        </div>
      ) : null}
      {list.length === 0 && agreement ? null : list.length === 0 ? (
        <div className="panel mt-8 border-dashed bg-white/50">
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
        <ul className="mt-8 space-y-4">
          {list.map((order) => {
            const printed = isPrintedPlan(order.plan);
            const key = nowKey(order.status, printed);
            const cancelled = order.status === "cancelled";
            const waitingPayment = order.status === "pending_payment";
            return (
              <li key={order.id} className="panel group relative transition-colors hover:border-line-strong">
                <div className="flex gap-4 p-4 sm:gap-6 sm:p-5">
                  <div className="w-16 shrink-0 sm:w-24">
                    <CoverPreview
                      template={order.book.coverTemplate}
                      format={order.book.format}
                      title={order.book.title}
                      names={coverNames(order.book)}
                      photos={photoUrls(coverPhotoIds(order.book), "thumb")}
                      design={order.book.coverDesign}
                      lite
                      className="rounded-[3px] shadow-book"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                      <div className="min-w-0">
                        {/* Вся строка — ссылка: растягиваем её на лист, кнопка внизу — просто подпись действия. */}
                        <Link href={`/orders/${order.id}`} className="line-clamp-2 font-serif text-xl leading-tight font-medium after:absolute after:inset-0 after:content-[''] group-hover:text-wine sm:text-2xl">
                          {order.book.title}
                        </Link>
                        <p className="mt-1 text-sm text-muted">
                          {t.number(order.number)} · {formatDate(order.createdAt, false, locale)}
                        </p>
                        <p className="text-sm text-muted">
                          {planName(order.plan, locale)}
                          {order.quantity > 1 ? ` × ${order.quantity}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                        <span className="text-lg font-semibold tabular-nums sm:text-xl">{formatPrice(order.amount)}</span>
                        <Badge tone={orderStatusTone[order.status]}>{orderStatusLabel(order.status, locale, printed)}</Badge>
                      </div>
                    </div>

                    {cancelled ? null : <StatusTrack steps={orderSteps(printed, o.steps)} status={order.status} label={o.stepsAria} size="sm" className="mt-5" />}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                      <p className="min-w-0 flex-1 basis-56 text-sm text-ink-soft">
                        <span className="font-medium text-ink">{o.now.title[key]}.</span> <span className="max-sm:hidden">{o.now.text[key]}</span>
                      </p>
                      {waitingPayment ? (
                        <span className="btn btn-primary btn-sm max-sm:w-full">{t.pay}</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-sm font-medium text-ink-soft group-hover:text-wine">
                          {t.open}
                          <ChevronRight className="size-4" aria-hidden />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
