import { Link } from "@/i18n/client";
import { Confetti } from "@/components/motion/Confetti";
import { CelebrateArt } from "@/components/illustrations";
import { Check, Download, Gift, Star } from "lucide-react";
import { formatPrice, isQuotedDelivery, site } from "@/config/site";
import { deliveryAddress } from "@/modules/ordering/ui/labels";
import type { getMessages } from "@/i18n/server";
import { addonName, deliveryName, planName } from "@/i18n/labels";
import type { Locale } from "@/i18n/config";
import { THANK_YOU } from "@/modules/feedback";
import { REFERRAL } from "@/modules/referrals";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverPhotoIds } from "@/lib/book/covers";
import { coverNames } from "@/lib/book/cover-names";
import { photoUrls } from "@/lib/urls";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import type { container } from "@/server/container";

type Messages = Awaited<ReturnType<typeof getMessages>>;
type T = Messages["orders"]["order"];
type OrderView = NonNullable<Awaited<ReturnType<ReturnType<typeof container>["ordering"]["queries"]["orderDetails"]>>>;

/** Шаги заказа полосой: пройденные — цветом, текущий — жирным, с галочкой после оплаты. */
export function OrderProgress({ steps, currentStep, paid }: { steps: { status: string; label: string }[]; currentStep: number; paid: boolean }) {
  return (
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
  );
}

/** Оплата получена: конфетти и что будет дальше. */
export function PaidThanks({ orderId, printed, t }: { orderId: string; printed: boolean; t: T }) {
  return (
      <section className="card flex flex-col items-center gap-6 overflow-hidden p-6 text-center sm:flex-row sm:p-8 sm:text-left">
        <Confetti onceKey={`paid_${orderId}`} />
        <CelebrateArt className="h-32 w-auto shrink-0" />
        <div>
          <h2 className="font-serif text-3xl font-medium">{t.thanks}</h2>
          <p className="mt-2 leading-relaxed text-ink-soft">
            {printed ? t.thanksPrinted : t.thanksDigital}
          </p>
        </div>
      </section>
  );
}

/** Файлы книги после оплаты: читательская версия, для электронного тарифа — файлы для печати; трек-номер. */
export function OrderFiles({ order, printed, t }: { order: { id: string; trackingNumber: string | null }; printed: boolean; t: T }) {
  return (
      <section className="card p-6 sm:p-8">
        <h2 className="text-xl font-semibold">{t.files}</h2>
        <p className="mt-1 text-sm text-muted">{t.filesNote}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href={`/api/orders/${order.id}/files/reading`} className="btn btn-primary">
            <Download className="size-4" /> {t.reading}
          </a>
          {!printed ? (
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
  );
}

/** Дозаказ печатной версии к оплаченной электронной. */
export function UpgradeCard({ upgrade, t }: { upgrade: { bookId: string; orderId: string; credit: number }; t: T }) {
  return (
      <section className="card p-6 sm:p-8" data-testid="upgrade-card">
        <h2 className="text-xl font-semibold">{t.upgrade.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.upgrade.text(upgrade.credit > 0 ? formatPrice(upgrade.credit) : "0")}</p>
        <Link href={`/books/${upgrade.bookId}/checkout?upgrade=${upgrade.orderId}`} className="btn btn-primary mt-5">
          {t.upgrade.cta}
        </Link>
      </section>
  );
}

/** Детали заказа и сумма по строкам. */
export function OrderDetails({ order, printed, locale, t, free }: { order: OrderView; printed: boolean; locale: Locale; t: T; free: string }) {
  // Доставка не вошла в сумму — рассчитывается индивидуально (у старых заказов с оплаченной доставкой — её сумма).
  const deliveryQuoted = isQuotedDelivery(order.deliveryMethod) && !order.deliveryAmount;
  return (
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
              <dd>{deliveryAddress({ ...order, country: order.deliveryCountry })}</dd>
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
          {order.discountAmount ? <div className="flex justify-between text-emerald-700"><span>{order.promoCode ? t.promo(order.promoCode) : t.agreedPrice}</span><span>−{formatPrice(order.discountAmount)}</span></div> : null}
          {order.addons.length ? <div className="flex justify-between"><span className="text-muted">{order.addons.map((a) => addonName(a, locale)).join(", ")}</span><span>{formatPrice(order.addonsAmount)}</span></div> : null}
          {printed ? <div className="flex justify-between"><span className="text-muted">{t.delivery}</span><span>{order.deliveryAmount ? formatPrice(order.deliveryAmount) : deliveryQuoted ? t.quotedPrice : free}</span></div> : null}
          {order.prepaidAmount ? <div className="flex justify-between text-emerald-700"><span>{t.prepaid}</span><span>−{formatPrice(order.prepaidAmount)}</span></div> : null}
          <div className="flex justify-between pt-2 text-base font-semibold"><span>{order.prepaidAmount ? t.toPayNow : t.total}</span><span>{formatPrice(order.amount)}</span></div>
          {printed && deliveryQuoted ? <p className="pt-2 text-xs text-muted" data-testid="abroad-order-note">{t.quotedNote}</p> : null}
        </div>
      </section>
  );
}

/** Обложка книги, ссылка на макет и контакты. */
export function BookAside({ book, t }: { book: OrderView["book"]; t: T }) {
  return (
    <aside>
      <div className="card sticky top-24 p-6 text-center">
        <div className="mx-auto w-40">
          <CoverPreview
            template={book.coverTemplate}
            format={book.format}
            title={book.title}
            subtitle={book.subtitle}
            names={coverNames(book)}
            photos={photoUrls(coverPhotoIds(book))}
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

/** Приглашение друзей — после оплаты, когда клиент уже знает, что книга будет. */
export function InviteCard({ t }: { t: Awaited<ReturnType<typeof getMessages>>["invite"]["card"] }) {
  return (
    <section className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:px-8">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose text-wine">
        <Gift className="size-5" />
      </span>
      <div className="flex-1">
        <h2 className="font-semibold">{t.title}</h2>
        <p className="mt-0.5 text-sm text-ink-soft">{t.text(REFERRAL.friendPercent, REFERRAL.rewardPercent)}</p>
      </div>
      <Link href="/invite" className="btn btn-outline shrink-0">
        {t.button}
      </Link>
    </section>
  );
}
