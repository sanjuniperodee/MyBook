import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { TrackOnce } from "@/components/analytics/TrackOnce";
import { Confetti } from "@/components/motion/Confetti";
import { CelebrateArt } from "@/components/illustrations";
import { notFound } from "next/navigation";
import { Check, Download, Gift, Star } from "lucide-react";
import { isStaff, requireUser } from "@/server/auth";
import { container } from "@/server/container";
import { formatPrice, getPlan, site } from "@/config/site";
import { getLocale, getMessages } from "@/i18n/server";
import { addonName, deliveryName, planName } from "@/i18n/labels";
import { env } from "@/config/env";
import { isOnlinePayment } from "@/modules/ordering";
import { canReview, THANK_YOU } from "@/modules/feedback";
import { orderStatusColors, orderStatusLabel } from "@/modules/ordering/ui/status";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { cn, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/modules/ordering/domain";
import { PaymentBlock } from "./PaymentBlock";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).orders.order.meta };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const order = await container().ordering.queries.orderDetails(id);
  if (!order || (order.userId !== user.id && !isStaff(user))) notFound();
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
  const paid = !["pending_payment", "cancelled"].includes(order.status);
  const reviewable = own && canReview({ status: order.status, plan: order.plan, paid });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/orders" className="text-sm text-muted hover:text-ink">{t.back}</Link>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="font-serif text-4xl font-medium sm:text-5xl">{t.title(order.number)}</h1>
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", orderStatusColors[order.status])}>{orderStatusLabel(order.status, locale)}</span>
      </div>
      <p className="mt-2 text-muted">{t.created(formatDate(order.createdAt, true, locale))}</p>
      {paid ? <TrackOnce id={`order_${order.id}`} name="purchase" value={order.amount} /> : null}

      {order.status !== "cancelled" ? (
        <ol className="mt-8 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => (
            <li key={s.status} className="flex min-w-0 flex-col gap-2">
              <div className={cn("h-1.5 rounded-full", i <= currentStep ? "bg-wine" : "bg-line")} />
              {/* На телефоне пять подписей в ряд — без галочек и мельче, иначе наезжают друг на друга. */}
              <div className={cn("flex items-center gap-1 text-[11px] leading-tight break-words hyphens-auto sm:text-sm", i <= currentStep ? "text-ink" : "text-muted", i === currentStep && "font-medium")}>
                {i < currentStep || (i === currentStep && paid) ? <Check className="hidden size-3.5 shrink-0 text-wine sm:block" /> : null}
                {s.label}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

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
            />
          ) : null}

          {paid && order.status === "paid" ? (
            <section className="card flex flex-col items-center gap-6 overflow-hidden p-6 text-center sm:flex-row sm:p-8 sm:text-left">
              <Confetti onceKey={`paid_${order.id}`} />
              <CelebrateArt className="h-32 w-auto shrink-0" />
              <div>
                <h2 className="font-serif text-3xl font-medium">{t.thanks}</h2>
                <p className="mt-2 leading-relaxed text-ink-soft">
                  {plan?.printed ? t.thanksPrinted : t.thanksDigital}
                </p>
              </div>
            </section>
          ) : null}

          {paid ? (
            <section className="card p-6 sm:p-8">
              <h2 className="text-xl font-semibold">{t.files}</h2>
              <p className="mt-1 text-sm text-muted">{t.filesNote}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href={`/api/orders/${order.id}/files/reading`} className="btn btn-primary">
                  <Download className="size-4" /> {t.reading}
                </a>
                {!plan?.printed ? (
                  <>
                    <a href={`/api/orders/${order.id}/files/block`} className="btn btn-outline">
                      <Download className="size-4" /> {t.block}
                    </a>
                    <a href={`/api/orders/${order.id}/files/cover`} className="btn btn-outline">
                      <Download className="size-4" /> {t.cover}
                    </a>
                    <a href={`/api/orders/${order.id}/files/spec`} className="btn btn-ghost">
                      {t.spec}
                    </a>
                  </>
                ) : null}
              </div>
              {order.trackingNumber ? (
                <p className="mt-6 text-sm">
                  {t.tracking} <b>{order.trackingNumber}</b>
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="card p-6 sm:p-8">
            <h2 className="text-xl font-semibold">{t.details}</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-muted">{t.plan}</dt>
              <dd>
                {planName(order.plan, locale)}
                {order.quantity > 1 ? ` × ${order.quantity}` : ""}
              </dd>
              {order.deliveryMethod ? (
                <>
                  <dt className="text-muted">{t.delivery}</dt>
                  <dd>{deliveryName(order.deliveryMethod, locale)}</dd>
                </>
              ) : null}
              {order.address ? (
                <>
                  <dt className="text-muted">{t.address}</dt>
                  <dd>{[order.postalCode, order.city, order.address].filter(Boolean).join(", ")}</dd>
                </>
              ) : null}
              <dt className="text-muted">{t.recipient}</dt>
              <dd>
                {order.contactName}, {order.contactPhone}
              </dd>
              <dt className="text-muted">{t.email}</dt>
              <dd>{order.contactEmail}</dd>
              {order.giftNote ? (
                <>
                  <dt className="text-muted">{t.card}</dt>
                  <dd className="whitespace-pre-line italic">«{order.giftNote}»</dd>
                </>
              ) : null}
              {order.desiredDate ? (
                <>
                  <dt className="text-muted">{t.neededBy}</dt>
                  <dd>{formatDate(order.desiredDate, false, locale)}{order.surprise ? t.surprise : ""}</dd>
                </>
              ) : null}
              {order.customerComment ? (
                <>
                  <dt className="text-muted">{t.comment}</dt>
                  <dd className="whitespace-pre-line">{order.customerComment}</dd>
                </>
              ) : null}
            </dl>
            <div className="mt-6 space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between"><span className="text-muted">{t.books}</span><span>{formatPrice(order.itemsAmount)}</span></div>
              {order.discountAmount ? <div className="flex justify-between text-emerald-700"><span>{t.promo(order.promoCode ?? "")}</span><span>−{formatPrice(order.discountAmount)}</span></div> : null}
              {order.addons.length ? <div className="flex justify-between"><span className="text-muted">{order.addons.map((a) => addonName(a, locale)).join(", ")}</span><span>{formatPrice(order.addonsAmount)}</span></div> : null}
              {plan?.printed ? <div className="flex justify-between"><span className="text-muted">{t.delivery}</span><span>{order.deliveryAmount ? formatPrice(order.deliveryAmount) : m.common.free}</span></div> : null}
              <div className="flex justify-between pt-2 text-base font-semibold"><span>{t.total}</span><span>{formatPrice(order.amount)}</span></div>
            </div>
          </section>
        </div>

        <aside>
          <div className="card sticky top-24 p-6 text-center">
            <div className="mx-auto w-40">
              <CoverPreview
                template={book.coverTemplate}
                format={book.format}
                title={book.title}
                subtitle={book.subtitle}
                names={coverNamesLine(book.authorName, book.recipientName, book.hideRecipientOnCover)}
                photoUrl={book.coverPhotoId ? photoUrl(book.coverPhotoId) : undefined}
                className="rounded-[3px] shadow-book"
              />
            </div>
            <div className="mt-4 font-serif text-xl">{book.title}</div>
            <Link href={`/books/${book.id}/preview`} className="mt-2 inline-block text-sm text-wine hover:underline">{t.preview}</Link>
            <p className="mt-6 text-xs text-muted">
              {t.questions}{" "}
              <a href={site.contacts.whatsapp} className="text-wine underline" target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>{" "}
              · {site.contacts.email}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

/** Приглашение оценить книгу — или благодарность с промокодом, если отзыв уже оставлен. */
function ReviewCard({
  orderId,
  review,
  t,
}: {
  orderId: string;
  review: { rating: number; status: string; thankYouCode: string | null } | null;
  t: Awaited<ReturnType<typeof getMessages>>["review"]["card"];
}) {
  if (!review)
    return (
      <section className="card flex flex-col items-start gap-5 bg-[linear-gradient(120deg,#fbf3ef,#fff)] p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="flex shrink-0 gap-0.5 text-amber-400" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="size-6 fill-current" strokeWidth={1.5} />
          ))}
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-2xl font-medium">{t.title}</h2>
          <p className="mt-1 text-ink-soft">{t.text(THANK_YOU.percent)}</p>
        </div>
        <Link href={`/review/${orderId}`} className="btn btn-primary shrink-0">
          {t.button}
        </Link>
      </section>
    );
  return (
    <section className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-5 sm:px-8">
      <div className="flex items-center gap-2 font-medium">
        <span className="flex gap-0.5 text-amber-400" aria-label={`${review.rating}/5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("size-4", n <= review.rating ? "fill-current" : "text-line")} strokeWidth={1.5} />
          ))}
        </span>
        {t.done}
      </div>
      {review.thankYouCode ? (
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <Gift className="size-4 text-wine" /> {t.code}: <code className="rounded bg-cream px-2 py-0.5 font-mono tracking-wider text-ink">{review.thankYouCode}</code>
        </div>
      ) : null}
      {review.status === "new" ? (
        <Link href={`/review/${orderId}`} className="ml-auto text-sm text-wine hover:underline">
          {t.edit}
        </Link>
      ) : null}
    </section>
  );
}
