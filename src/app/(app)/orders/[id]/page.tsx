import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/client";
import { TrackOnce } from "@/components/analytics/TrackOnce";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { can, getStaff, canSeeOrder } from "@/server/access";
import { container } from "@/server/container";
import { manualPaymentProps } from "@/server/requisites";
import { formatPrice, getPlan } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { env } from "@/config/env";
import { isOnlinePayment } from "@/modules/ordering";
import { canReview } from "@/modules/feedback";
import { orderStatusLabel, orderStatusTone } from "@/modules/ordering/ui/status";
import { Badge } from "@/components/ui/Badge";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNames } from "@/lib/book/cover-names";
import { coverPhotoIds } from "@/lib/book/covers";
import { photoUrls } from "@/lib/urls";
import { formatDate } from "@/lib/dates";
import { isPaid } from "@/modules/ordering/domain";
import { kaspiPaymentProps } from "@/app/api/payments/kaspi/view";
import { PaymentBlock } from "./PaymentBlock";
import { BookAside, InviteCard, OrderDetails, OrderFiles, OrderHelp, OrderStatusSheet, ReviewCard, UpgradeCard } from "./sections";
import { orderSteps } from "../StatusTrack";
import { pageId } from "@/server/input";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.order.meta };
}

/**
 * Заказ — разворот: слева что с заказом сейчас, что сделать (оплатить, скачать файлы, оценить) и детали; справа — книга.
 * На телефоне одна колонка, а обложка уходит в шапку.
 */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  pageId(id);
  const order = await container().ordering.queries.orderDetails(id);
  // Чужой заказ — только сотруднику с правом «Видеть заказы», вошедшему по правилам «Безопасности» (V1); роли «только
  // свои» — только заказ своего клиента.
  const staff = order && order.userId !== user.id ? await getStaff() : null;
  if (!order || (order.userId !== user.id && !(staff && can(staff, "orders.view") && (await canSeeOrder(staff, order.id))))) notFound();
  const own = order.userId === user.id;
  const [locale, m, review] = await Promise.all([getLocale(), getMessages(), own ? container().feedback.queries.byOrder(order.id) : null]);
  const t = m.orders.order;
  const plan = getPlan(order.plan);
  const printed = !!plan?.printed;
  const book = order.book;
  const steps = orderSteps(printed, t.steps);
  const paid = isPaid(order.status);
  const reviewable = own && canReview({ status: order.status, plan: order.plan, paid });
  // Оплаченная электронная версия без печатного заказа: можно дозаказать книгу на бумаге, оплата электронной засчитается.
  const upgrade = own && !plan?.printed && order.status === "paid" ? await container().ordering.orders.upgradeOffer(order.id, user.id) : null;
  const kaspi = own && order.status === "pending_payment" ? await kaspiPaymentProps({ kind: "order", id: order.id }, order.contactPhone) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/orders" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2 text-sm text-muted hover:bg-ink/5 hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> {t.back}
      </Link>
      <header className="mt-2 flex items-start gap-4 sm:gap-6">
        {/* Телефон: обложка рядом с номером; на широком экране она в правой колонке. */}
        <div className="w-14 shrink-0 lg:hidden">
          <CoverPreview template={book.coverTemplate} format={book.format} title={book.title} names={coverNames(book)} photos={photoUrls(coverPhotoIds(book), "thumb")} design={book.coverDesign} lite className="rounded-[3px] shadow-book" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-serif text-4xl leading-none font-medium sm:text-5xl">{t.title(order.number)}</h1>
            <Badge tone={orderStatusTone[order.status]}>{orderStatusLabel(order.status, locale, printed)}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted sm:text-[15px]">{t.created(formatDate(order.createdAt, true, locale))}</p>
          <p className="mt-0.5 truncate font-serif text-lg text-ink-soft lg:hidden">{book.title}</p>
        </div>
        <div className="shrink-0 text-right max-sm:hidden">
          <div className="text-xs text-muted">{t.total}</div>
          <div className="text-2xl font-semibold tabular-nums">{formatPrice(order.amount)}</div>
        </div>
      </header>
      {paid ? <TrackOnce id={`order_${order.id}`} name="purchase" value={order.amount} /> : null}

      <div className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="min-w-0 space-y-6">
          <OrderStatusSheet orderId={order.id} status={order.status} printed={printed} steps={steps} trackingNumber={order.trackingNumber} t={t} />

          {reviewable ? <ReviewCard orderId={order.id} review={review} t={m.review.card} /> : null}

          {order.status === "pending_payment" && own ? (
            <PaymentBlock
              orderId={order.id}
              number={order.number}
              amount={order.amount}
              amountLabel={formatPrice(order.amount)}
              currency={order.currency}
              email={order.contactEmail}
              online={isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null}
              manual={await manualPaymentProps(m)}
              unavailable={m.common.manualPayment.unavailable}
              claimed={!!order.paymentClaimedAt}
              kaspi={kaspi}
            />
          ) : null}

          {paid ? <OrderFiles order={order} printed={printed} t={t} /> : null}

          {upgrade ? <UpgradeCard upgrade={upgrade} t={t} /> : null}

          {own && paid ? <InviteCard t={m.invite.card} /> : null}

          <OrderDetails order={order} printed={printed} locale={locale} t={t} free={m.common.free} />

          <OrderHelp t={t} className="lg:hidden" />
        </div>

        <BookAside book={book} t={t} />
      </div>
    </main>
  );
}
