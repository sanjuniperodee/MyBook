import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { TrackOnce } from "@/components/analytics/TrackOnce";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { can, getStaff } from "@/server/access";
import { container } from "@/server/container";
import { formatPrice, getPlan } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { env } from "@/config/env";
import { isOnlinePayment } from "@/modules/ordering";
import { canReview } from "@/modules/feedback";
import { orderStatusColors, orderStatusLabel } from "@/modules/ordering/ui/status";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { isPaid } from "@/modules/ordering/domain";
import type { OrderStatus } from "@/shared/domain/orders";
import { kaspiPaymentProps } from "@/app/api/payments/kaspi/view";
import { PaymentBlock } from "./PaymentBlock";
import { BookAside, InviteCard, OrderDetails, OrderFiles, OrderProgress, PaidThanks, ReviewCard, UpgradeCard } from "./sections";
import { pageId } from "@/server/input";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.order.meta };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  pageId(id);
  const order = await container().ordering.queries.orderDetails(id);
  // Чужой заказ — только сотруднику с правом «Видеть заказы», вошедшему по правилам «Безопасности» (V1).
  if (!order || (order.userId !== user.id && !can(await getStaff(), "orders.view"))) notFound();
  const own = order.userId === user.id;
  const [locale, m, review] = await Promise.all([getLocale(), getMessages(), own ? container().feedback.queries.byOrder(order.id) : null]);
  const t = m.orders.order;
  const plan = getPlan(order.plan);
  const book = order.book;
  const steps: { status: OrderStatus; label: string }[] = plan?.printed
    ? [
        { status: "pending_payment", label: t.steps.placed },
        { status: "paid", label: t.steps.paid },
        { status: "in_production", label: t.steps.printing },
        { status: "shipped", label: t.steps.shipping },
        { status: "delivered", label: t.steps.delivered },
      ]
    : [
        { status: "pending_payment", label: t.steps.placed },
        { status: "paid", label: t.steps.ready },
      ];
  const currentStep = steps.findIndex((s) => s.status === order.status);
  const paid = isPaid(order.status);
  const reviewable = own && canReview({ status: order.status, plan: order.plan, paid });
  // Оплаченная электронная версия без печатного заказа: можно дозаказать книгу на бумаге, оплата электронной засчитается.
  const upgrade = own && !plan?.printed && order.status === "paid" ? await container().ordering.orders.upgradeOffer(order.id, user.id) : null;
  const kaspi = own && order.status === "pending_payment" ? await kaspiPaymentProps({ kind: "order", id: order.id }, order.contactPhone) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/orders" className="text-sm text-muted hover:text-ink">{t.back}</Link>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="font-serif text-3xl font-medium sm:text-5xl">{t.title(order.number)}</h1>
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", orderStatusColors[order.status])}>{orderStatusLabel(order.status, locale, !!plan?.printed)}</span>
      </div>
      <p className="mt-2 text-muted">{t.created(formatDate(order.createdAt, true, locale))}</p>
      {paid ? <TrackOnce id={`order_${order.id}`} name="purchase" value={order.amount} /> : null}

      {order.status !== "cancelled" ? <OrderProgress steps={steps} currentStep={currentStep} paid={paid} /> : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
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
              manual={m.common.manualPayment}
              claimed={!!order.paymentClaimedAt}
              kaspi={kaspi}
            />
          ) : null}

          {paid && order.status === "paid" ? <PaidThanks orderId={order.id} printed={!!plan?.printed} t={t} /> : null}

          {paid ? <OrderFiles order={order} printed={!!plan?.printed} t={t} /> : null}

          {upgrade ? <UpgradeCard upgrade={upgrade} t={t} /> : null}

          {own && paid ? <InviteCard t={m.invite.card} /> : null}

          <OrderDetails order={order} printed={!!plan?.printed} locale={locale} t={t} free={m.common.free} />
        </div>

        <BookAside book={book} t={t} />
      </div>
    </main>
  );
}
