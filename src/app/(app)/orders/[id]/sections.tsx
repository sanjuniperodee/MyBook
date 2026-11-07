import { Link } from "@/i18n/client";
import { Confetti } from "@/components/motion/Confetti";
import { Gift, Star, Truck } from "lucide-react";
import { formatPrice, isQuotedDelivery, site } from "@/config/site";
import { deliveryAddress } from "@/modules/ordering/ui/labels";
import type { getMessages } from "@/i18n/server";
import { addonName, deliveryName, planName } from "@/i18n/labels";
import type { Locale } from "@/i18n/config";
import { THANK_YOU } from "@/modules/feedback";
import { REFERRAL } from "@/modules/referrals";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { Panel } from "@/components/ui/Panel";
import { Facts, type Fact } from "@/components/ui/Facts";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { photoUrls } from "@/lib/urls";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import type { OrderStatus } from "@/shared/domain/orders";
import type { container } from "@/server/container";
import { FileButtons } from "./FileButtons";
import { nowKey, StatusTrack, type TrackStep } from "../StatusTrack";

type Messages = Awaited<ReturnType<typeof getMessages>>;
type T = Messages["orders"]["order"];
type OrderView = NonNullable<Awaited<ReturnType<ReturnType<typeof container>["ordering"]["queries"]["orderDetails"]>>>;

/**
 * Статус заказа: что с ним сейчас и что дальше (крупно, шрифтом книги), линейка этапов и трек-номер, когда книга отправлена.
 * Сразу после оплаты — конфетти один раз на заказ (отклик на действие).
 */
export function OrderStatusSheet({ orderId, status, printed, steps, trackingNumber, t }: { orderId: string; status: OrderStatus; printed: boolean; steps: TrackStep[]; trackingNumber: string | null; t: T }) {
  const key = nowKey(status, printed);
  const cancelled = status === "cancelled";
  const at = steps.findIndex((s) => s.status === status);
  return (
    <section className="panel" aria-labelledby="order-now">
      {status === "paid" ? <Confetti onceKey={`paid_${orderId}`} /> : null}
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="order-now" className="font-serif text-3xl leading-tight font-medium sm:text-4xl">
            {t.now.title[key]}
          </h2>
          {!cancelled && at >= 0 ? <span className="text-sm text-muted tabular-nums sm:hidden">{t.stepOf(at + 1, steps.length)}</span> : null}
        </div>
        <p className="mt-2 max-w-xl leading-relaxed text-ink-soft">{t.now.text[key]}</p>
        {cancelled ? null : <StatusTrack steps={steps} status={status} label={t.stepsAria} className="mt-7" />}
        {trackingNumber ? (
          <p className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[var(--r-ctl)] bg-sunken px-4 py-3 text-sm">
            <Truck className="size-4 shrink-0 text-wine" aria-hidden />
            <span className="text-muted">{t.tracking}</span>
            <b className="font-mono tracking-wide select-all">{trackingNumber}</b>
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Файлы книги после оплаты: читательская версия, для электронного тарифа — файлы для печати. */
export function OrderFiles({ order, printed, t }: { order: { id: string }; printed: boolean; t: T }) {
  return (
    <Panel title={t.files} description={t.filesNote}>
      <FileButtons orderId={order.id} printed={printed} />
    </Panel>
  );
}

/** Дозаказ печатной версии к оплаченной электронной. */
export function UpgradeCard({ upgrade, t }: { upgrade: { bookId: string; orderId: string; credit: number }; t: T }) {
  return (
    <section className="panel flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6" data-testid="upgrade-card">
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold">{t.upgrade.title}</h2>
        <p className="mt-1 max-w-lg text-sm text-ink-soft">{t.upgrade.text(upgrade.credit > 0 ? formatPrice(upgrade.credit) : "0")}</p>
      </div>
      <Link href={`/books/${upgrade.bookId}/checkout?upgrade=${upgrade.orderId}`} className="btn btn-primary shrink-0 max-sm:w-full">
        {t.upgrade.cta}
      </Link>
    </section>
  );
}

/** Детали заказа: кто, куда, к какому сроку, а ниже — сумма по строкам, как в чеке. */
export function OrderDetails({ order, printed, locale, t, free }: { order: OrderView; printed: boolean; locale: Locale; t: T; free: string }) {
  // Доставка не вошла в сумму — рассчитывается индивидуально (у старых заказов с оплаченной доставкой — её сумма).
  const deliveryQuoted = isQuotedDelivery(order.deliveryMethod) && !order.deliveryAmount;
  const facts: Fact[] = [
    { label: t.plan, value: `${planName(order.plan, locale)}${order.quantity > 1 ? ` × ${order.quantity}` : ""}` },
    { label: t.delivery, value: order.deliveryMethod ? deliveryName(order.deliveryMethod, locale) : null, hidden: !order.deliveryMethod },
    { label: t.address, value: order.address ? deliveryAddress({ ...order, country: order.deliveryCountry }) : null, hidden: !order.address },
    { label: t.recipient, value: `${order.contactName}, ${order.contactPhone}` },
    { label: t.email, value: order.contactEmail },
    { label: t.card, value: <span className="whitespace-pre-line italic">«{order.giftNote}»</span>, hidden: !order.giftNote },
    { label: t.neededBy, value: order.desiredDate ? `${formatDate(order.desiredDate, false, locale)}${order.surprise ? t.surprise : ""}` : null, hidden: !order.desiredDate },
    { label: t.comment, value: <span className="whitespace-pre-line">{order.customerComment}</span>, hidden: !order.customerComment },
  ];
  const line = "flex items-baseline justify-between gap-4";
  return (
    <Panel title={t.details}>
      <Facts items={facts} />
      <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm tabular-nums">
        <div className={line}>
          <span className="text-muted">{t.books}</span>
          <span>{formatPrice(order.itemsAmount)}</span>
        </div>
        {order.discountAmount ? (
          <div className={cn(line, "text-success")}>
            <span>{order.promoCode ? t.promo(order.promoCode) : t.agreedPrice}</span>
            <span>−{formatPrice(order.discountAmount)}</span>
          </div>
        ) : null}
        {order.addons.length ? (
          <div className={line}>
            <span className="text-muted">{order.addons.map((a) => addonName(a, locale)).join(", ")}</span>
            <span>{formatPrice(order.addonsAmount)}</span>
          </div>
        ) : null}
        {printed ? (
          <div className={line}>
            <span className="text-muted">{t.delivery}</span>
            <span className="text-right">{order.deliveryAmount ? formatPrice(order.deliveryAmount) : deliveryQuoted ? t.quotedPrice : free}</span>
          </div>
        ) : null}
        {order.prepaidAmount ? (
          <div className={cn(line, "text-success")}>
            <span>{t.prepaid}</span>
            <span>−{formatPrice(order.prepaidAmount)}</span>
          </div>
        ) : null}
        <div className={cn(line, "border-t border-line pt-3 text-base font-semibold")}>
          <span>{order.prepaidAmount ? t.toPayNow : t.total}</span>
          <span className="text-lg">{formatPrice(order.amount)}</span>
        </div>
        {printed && deliveryQuoted ? (
          <p className="pt-2 text-xs leading-relaxed text-muted" data-testid="abroad-order-note">
            {t.quotedNote}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

/** Контакты по заказу: на компьютере — внизу правой колонки, на телефоне — отдельной строкой в конце страницы. */
export function OrderHelp({ t, className }: { t: T; className?: string }) {
  return (
    <p className={cn("text-xs leading-relaxed text-muted", className)}>
      {t.questions}{" "}
      <a href={site.contacts.whatsapp} className="font-medium text-wine underline underline-offset-2" target="_blank" rel="noopener noreferrer">
        WhatsApp
      </a>
      {" · "}
      <a href={`mailto:${site.contacts.email}`} className="underline underline-offset-2">
        {site.contacts.email}
      </a>
    </p>
  );
}

/** Книга заказа справа: обложка, название и ссылка на макет. Липкая на широком экране; на телефоне вместо неё — мини-обложка в шапке. */
export function BookAside({ book, t }: { book: OrderView["book"]; t: T }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 text-center">
        <div className="mx-auto w-44">
          <CoverPreview
            template={book.coverTemplate}
            format={book.format}
            title={book.title}
            subtitle={book.subtitle}
            names={coverNames(book)}
            photos={photoUrls(coverPhotoIds(book))}
            design={book.coverDesign}
            className="rounded-[3px] shadow-book"
          />
        </div>
        <div className="mt-5 font-serif text-2xl leading-tight">{book.title}</div>
        <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm mt-3">
          {t.preview}
        </Link>
        <div className="mt-8 border-t border-line pt-4 text-left">
          <OrderHelp t={t} />
        </div>
      </div>
    </aside>
  );
}

/** Приглашение оценить книгу — или благодарность с промокодом, если отзыв уже оставлен. */
export function ReviewCard({
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
      <section className="panel flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <div className="flex shrink-0 gap-0.5 text-warning" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} className="size-5 fill-current" strokeWidth={1.5} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-2xl leading-tight font-medium">{t.title}</h2>
          <p className="mt-1 text-sm text-ink-soft">{t.text(THANK_YOU.percent)}</p>
        </div>
        <Link href={`/review/${orderId}`} className="btn btn-primary shrink-0 max-sm:w-full">
          {t.button}
        </Link>
      </section>
    );
  return (
    <section className="panel flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-2 font-medium">
        <span className="flex gap-0.5 text-warning" aria-label={`${review.rating}/5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={cn("size-4", n <= review.rating ? "fill-current" : "text-line")} strokeWidth={1.5} />
          ))}
        </span>
        {t.done}
      </div>
      {review.thankYouCode ? (
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <Gift className="size-4 text-wine" aria-hidden /> {t.code}: <code className="rounded bg-cream px-2 py-0.5 font-mono tracking-wider text-ink">{review.thankYouCode}</code>
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

/** Приглашение друзей — после оплаты, когда клиент уже знает, что книга будет. */
export function InviteCard({ t }: { t: Awaited<ReturnType<typeof getMessages>>["invite"]["card"] }) {
  return (
    <section className="panel flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{t.title}</h2>
        <p className="mt-0.5 text-sm text-ink-soft">{t.text(REFERRAL.friendPercent, REFERRAL.rewardPercent)}</p>
      </div>
      <Link href="/invite" className="btn btn-outline shrink-0 max-sm:w-full">
        {t.button}
      </Link>
    </section>
  );
}
