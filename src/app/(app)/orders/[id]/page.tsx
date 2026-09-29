import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Download } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getOrderWithBook } from "@/lib/orders";
import { deliveryOptions, formatPrice, getPlan, site } from "@/config/site";
import { env } from "@/lib/env";
import { isOnlinePayment } from "@/lib/payments";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { CoverPreview } from "@/components/cover/CoverPreview";
import { coverNamesLine } from "@/lib/book/covers";
import { photoUrl } from "@/lib/urls";
import { cn, formatDate } from "@/lib/utils";
import type { OrderStatus } from "@/lib/db/schema";
import { PaymentBlock } from "./PaymentBlock";

export const metadata: Metadata = { title: "Заказ" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/orders/${id}`);
  const order = await getOrderWithBook(id);
  if (!order || (order.userId !== user.id && user.role !== "admin")) notFound();
  const plan = getPlan(order.plan);
  const book = order.book;
  const steps: { status: OrderStatus; label: string }[] = plan?.printed
    ? [
        { status: "pending_payment", label: "Оформлен" },
        { status: "paid", label: "Оплачен" },
        { status: "in_production", label: "Печатается" },
        { status: "shipped", label: "В пути" },
        { status: "delivered", label: "Доставлен" },
      ]
    : [
        { status: "pending_payment", label: "Оформлен" },
        { status: "paid", label: "Готов к скачиванию" },
      ];
  const currentStep = steps.findIndex((s) => s.status === order.status);
  const paid = !["pending_payment", "cancelled"].includes(order.status);
  const delivery = deliveryOptions.find((d) => d.id === order.deliveryMethod);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/orders" className="text-sm text-muted hover:text-ink">← Все заказы</Link>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <h1 className="font-serif text-4xl font-medium sm:text-5xl">Заказ №{order.number}</h1>
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", orderStatusColors[order.status])}>{orderStatusLabel(order.status)}</span>
      </div>
      <p className="mt-2 text-muted">от {formatDate(order.createdAt, true)}</p>

      {order.status !== "cancelled" ? (
        <ol className="mt-8 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => (
            <li key={s.status} className="flex flex-col gap-2">
              <div className={cn("h-1.5 rounded-full", i <= currentStep ? "bg-wine" : "bg-line")} />
              <div className={cn("flex items-center gap-1 text-xs sm:text-sm", i <= currentStep ? "text-ink" : "text-muted")}>
                {i < currentStep || (i === currentStep && paid) ? <Check className="size-3.5 shrink-0 text-wine" /> : null}
                {s.label}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          {order.status === "pending_payment" && order.userId === user.id ? (
            <PaymentBlock
              orderId={order.id}
              number={order.number}
              amount={order.amount}
              amountLabel={formatPrice(order.amount)}
              currency={order.currency}
              email={order.contactEmail}
              online={isOnlinePayment() ? { publicId: env.cloudpayments.publicId } : null}
              manual={site.manualPayment}
              claimed={!!order.paymentClaimedAt}
            />
          ) : null}

          {paid ? (
            <section className="card p-6 sm:p-8">
              <h2 className="text-xl font-semibold">Файлы книги</h2>
              <p className="mt-1 text-sm text-muted">Первое скачивание может занять до минуты — мы собираем книгу в полном качестве.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a href={`/api/orders/${order.id}/files/reading`} className="btn btn-primary">
                  <Download className="size-4" /> PDF для чтения
                </a>
                {!plan?.printed ? (
                  <>
                    <a href={`/api/orders/${order.id}/files/block`} className="btn btn-outline">
                      <Download className="size-4" /> Блок для типографии
                    </a>
                    <a href={`/api/orders/${order.id}/files/cover`} className="btn btn-outline">
                      <Download className="size-4" /> Обложка для типографии
                    </a>
                    <a href={`/api/orders/${order.id}/files/spec`} className="btn btn-ghost">
                      Техзадание
                    </a>
                  </>
                ) : null}
              </div>
              {order.trackingNumber ? (
                <p className="mt-6 text-sm">
                  Трек-номер для отслеживания: <b>{order.trackingNumber}</b>
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="card p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Детали</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-muted">Тариф</dt>
              <dd>
                {plan?.name}
                {order.quantity > 1 ? ` × ${order.quantity}` : ""}
              </dd>
              {delivery ? (
                <>
                  <dt className="text-muted">Доставка</dt>
                  <dd>{delivery.name}</dd>
                </>
              ) : null}
              {order.address ? (
                <>
                  <dt className="text-muted">Адрес</dt>
                  <dd>{[order.postalCode, order.city, order.address].filter(Boolean).join(", ")}</dd>
                </>
              ) : null}
              <dt className="text-muted">Получатель</dt>
              <dd>
                {order.contactName}, {order.contactPhone}
              </dd>
              <dt className="text-muted">E-mail</dt>
              <dd>{order.contactEmail}</dd>
              {order.giftNote ? (
                <>
                  <dt className="text-muted">Открытка</dt>
                  <dd className="whitespace-pre-line italic">«{order.giftNote}»</dd>
                </>
              ) : null}
              {order.desiredDate ? (
                <>
                  <dt className="text-muted">Нужна к</dt>
                  <dd>{formatDate(order.desiredDate)}{order.surprise ? " · сюрприз" : ""}</dd>
                </>
              ) : null}
              {order.customerComment ? (
                <>
                  <dt className="text-muted">Комментарий</dt>
                  <dd className="whitespace-pre-line">{order.customerComment}</dd>
                </>
              ) : null}
            </dl>
            <div className="mt-6 space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between"><span className="text-muted">Книги</span><span>{formatPrice(order.itemsAmount)}</span></div>
              {order.discountAmount ? <div className="flex justify-between text-emerald-700"><span>Промокод {order.promoCode}</span><span>−{formatPrice(order.discountAmount)}</span></div> : null}
              {plan?.printed ? <div className="flex justify-between"><span className="text-muted">Доставка</span><span>{order.deliveryAmount ? formatPrice(order.deliveryAmount) : "Бесплатно"}</span></div> : null}
              <div className="flex justify-between pt-2 text-base font-semibold"><span>Итого</span><span>{formatPrice(order.amount)}</span></div>
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
            <Link href={`/books/${book.id}/preview`} className="mt-2 inline-block text-sm text-wine hover:underline">Посмотреть макет</Link>
            <p className="mt-6 text-xs text-muted">
              Вопросы по заказу:{" "}
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
