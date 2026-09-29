import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileArchive } from "lucide-react";
import { getOrderWithBook } from "@/lib/orders";
import { deliveryOptions, formatPrice, getPlan } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { getBookStats } from "@/lib/books";
import { getTheme } from "@/lib/content/themes";
import { getFormat } from "@/lib/book/formats";
import { getTypography } from "@/lib/book/fonts";
import { getCoverTemplate } from "@/lib/book/covers";
import { cn, formatDate } from "@/lib/utils";
import { GenerateButton, LockButton, NoteForm, StatusForm } from "./OrderControls";

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderWithBook(id);
  if (!order) notFound();
  const plan = getPlan(order.plan);
  const book = order.book;
  const stats = await getBookStats(book);
  const spec = order.printSpec;
  const delivery = deliveryOptions.find((d) => d.id === order.deliveryMethod);
  const file = (kind: string) => `/api/orders/${order.id}/files/${kind}`;

  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="text-sm text-muted hover:text-ink">← Заказы</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Заказ №{order.number}</h1>
        <span className={cn("rounded-full px-3 py-1 text-sm", orderStatusColors[order.status])}>{orderStatusLabel(order.status)}</span>
        {order.paymentClaimedAt && order.status === "pending_payment" ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">Клиент сообщил об оплате {formatDate(order.paymentClaimedAt, true)}</span>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card title="Файлы для типографии">
            <div className="flex flex-wrap gap-2">
              <a href={`/api/admin/orders/${order.id}/package`} className="btn btn-primary btn-sm"><FileArchive className="size-4" /> Скачать всё (ZIP)</a>
              <a href={file("block")} className="btn btn-outline btn-sm"><Download className="size-4" /> Блок</a>
              <a href={file("cover")} className="btn btn-outline btn-sm"><Download className="size-4" /> Обложка</a>
              <a href={file("spec")} className="btn btn-outline btn-sm"><Download className="size-4" /> Техзадание</a>
              <a href={file("reading")} className="btn btn-ghost btn-sm"><Download className="size-4" /> PDF для чтения</a>
              <GenerateButton orderId={order.id} hasFiles={!!spec} />
            </div>
            {spec ? (
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Spec label="Формат" value={getFormat(spec.format).short} />
                <Spec label="Страниц" value={spec.pageCount} />
                <Spec label="Корешок" value={`${spec.spineMm} мм`} />
                <Spec label="Развёртка" value={`${spec.coverWidthMm}×${spec.coverHeightMm} мм`} />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted">Файлы ещё не генерировались. Они будут созданы при первом скачивании (≈ 15–60 секунд).</p>
            )}
            {spec ? <p className="mt-3 text-xs text-muted">Сгенерировано {formatDate(spec.generatedAt, true)}</p> : null}
          </Card>

          <Card title="Книга">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-muted">Название</dt><dd>{book.title}</dd>
              <dt className="text-muted">Тема</dt><dd>{getTheme(book.theme).name}</dd>
              <dt className="text-muted">Автор → адресат</dt><dd>{book.authorName} → {book.recipientName}</dd>
              <dt className="text-muted">Оформление</dt><dd>{getFormat(book.format).name} · {getTypography(book.typography).name} · обложка «{getCoverTemplate(book.coverTemplate).name}»</dd>
              <dt className="text-muted">Наполнение</dt><dd>{stats.answered} ответов · {stats.words} слов · {stats.photos} фото · ≈ {stats.printedPages} стр.</dd>
              <dt className="text-muted">Редактирование</dt><dd>{book.status === "draft" ? "открыто для клиента" : "закрыто"}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm">Предпросмотр</Link>
              <LockButton orderId={order.id} locked={book.status !== "draft"} />
            </div>
          </Card>

          <Card title="Клиент и доставка">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-muted">Получатель</dt><dd>{order.contactName}</dd>
              <dt className="text-muted">Телефон</dt><dd><a href={`tel:${order.contactPhone}`} className="underline">{order.contactPhone}</a></dd>
              <dt className="text-muted">E-mail</dt><dd><a href={`mailto:${order.contactEmail}`} className="underline">{order.contactEmail}</a></dd>
              <dt className="text-muted">Аккаунт</dt><dd>{order.user.email}</dd>
              {plan?.printed ? (
                <>
                  <dt className="text-muted">Доставка</dt><dd>{delivery?.name ?? "—"}</dd>
                  <dt className="text-muted">Адрес</dt><dd>{[order.postalCode, order.city, order.address].filter(Boolean).join(", ") || "—"}</dd>
                </>
              ) : null}
              {order.customerComment ? (<><dt className="text-muted">Комментарий</dt><dd className="whitespace-pre-line">{order.customerComment}</dd></>) : null}
            </dl>
          </Card>

          <Card title="Журнал">
            <ol className="space-y-3 text-sm">
              {order.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-36 shrink-0 text-muted">{formatDate(e.createdAt, true)}</span>
                  <span className="flex-1">
                    {e.status ? <b>{orderStatusLabel(e.status)}. </b> : null}
                    {e.note}
                    <span className="ml-2 text-xs text-muted">{e.actor}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Оплата">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{plan?.name} × {order.quantity}</dt><dd>{formatPrice(order.itemsAmount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Доставка</dt><dd>{formatPrice(order.deliveryAmount)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Итого</dt><dd>{formatPrice(order.amount)}</dd></div>
              <div className="flex justify-between pt-2 text-xs text-muted"><dt>Способ</dt><dd>{order.paymentProvider}{order.paymentId ? ` · ${order.paymentId}` : ""}</dd></div>
              {order.paidAt ? <div className="flex justify-between text-xs text-muted"><dt>Оплачен</dt><dd>{formatDate(order.paidAt, true)}</dd></div> : null}
            </dl>
          </Card>
          <Card title="Управление">
            <StatusForm orderId={order.id} status={order.status} trackingNumber={order.trackingNumber} />
          </Card>
          <Card title="Заметка">
            <NoteForm orderId={order.id} note={order.adminNote} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-cream/60 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
