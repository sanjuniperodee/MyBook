import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileArchive } from "lucide-react";
import { getOrderWithBook } from "@/lib/orders";
import { deliveryOptions, formatPrice, getPlan, addonName } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { getBookStats } from "@/lib/books";
import { getTheme } from "@/lib/content/themes";
import { getFormat } from "@/lib/book/formats";
import { getTypography } from "@/lib/book/fonts";
import { getCoverTemplate } from "@/lib/book/covers";
import { cn, formatDate } from "@/lib/utils";
import { DetailsForm, GenerateButton, LockButton, NoteForm, StatusForm } from "./OrderControls";
import { AssigneeSelect, NotesTimeline, TaskList, type NoteItem, type TaskItem } from "@/components/admin/CrmWidgets";
import { adminLabel, listAdmins } from "@/lib/crm";
import { db } from "@/lib/db";
import { crmNotes, crmTasks, orders as ordersTable } from "@/lib/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { ClipboardList, UserRound } from "lucide-react";

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrderWithBook(id);
  if (!order) notFound();
  const plan = getPlan(order.plan);
  const book = order.book;
  const [stats, admins, taskRows, noteRows, [clientStats]] = await Promise.all([
    getBookStats(book),
    listAdmins(),
    db.select().from(crmTasks).where(eq(crmTasks.orderId, order.id)).orderBy(sql`${crmTasks.doneAt} nulls first`, crmTasks.dueAt),
    db.select().from(crmNotes).where(eq(crmNotes.clientId, order.userId)).orderBy(desc(crmNotes.createdAt)).limit(30),
    db
      .select({ n: sql<number>`count(*)::int`, ltv: sql<number>`coalesce(sum(${ordersTable.amount}) filter (where ${ordersTable.paidAt} is not null),0)::int` })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, order.userId), ne(ordersTable.status, "cancelled"))),
  ]);
  const adminOptions = admins.map((a) => ({ id: a.id, label: adminLabel(a) }));
  const adminName = new Map(adminOptions.map((a) => [a.id, a.label]));
  const now = new Date();
  const tasks: TaskItem[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    dueLabel: t.dueAt ? `до ${formatDate(t.dueAt)}` : null,
    overdue: !!t.dueAt && t.dueAt < now,
    done: !!t.doneAt,
    assignee: t.assigneeId ? (adminName.get(t.assigneeId) ?? null) : null,
  }));
  const notes: NoteItem[] = noteRows.map((n) => ({
    id: n.id,
    kind: n.kind,
    text: n.text,
    author: n.authorId ? (adminName.get(n.authorId) ?? "—") : "—",
    dateLabel: formatDate(n.createdAt, true),
    orderLabel: n.orderId === order.id ? `заказ №${order.number}` : null,
  }));
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
        <div className="ml-auto flex gap-2">
          <Link href={`/admin/clients/${order.userId}`} className="btn btn-outline btn-sm">
            <UserRound className="size-4" /> Клиент · {clientStats.n} зак. · {formatPrice(clientStats.ltv)}
          </Link>
          {plan?.printed ? (
            <a href={`/print/orders/${order.id}`} target="_blank" rel="noopener" className="btn btn-outline btn-sm">
              <ClipboardList className="size-4" /> Упаковочный лист
            </a>
          ) : null}
        </div>
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
              {order.giftNote ? (<><dt className="text-muted">Открытка</dt><dd className="whitespace-pre-line italic">«{order.giftNote}»</dd></>) : null}
              {order.desiredDate ? (<><dt className="text-muted">Нужна к</dt><dd className="font-medium text-wine">{formatDate(order.desiredDate)}</dd></>) : null}
              {order.surprise ? (<><dt className="text-muted">Сюрприз</dt><dd className="font-medium text-wine">Не звонить получателю, связываться с заказчиком ({order.user.email})</dd></>) : null}
            </dl>
          </Card>

          <Card title="Задачи по заказу">
            <TaskList tasks={tasks} admins={adminOptions} orderId={order.id} clientId={order.userId} emptyText="Задач по заказу нет" />
          </Card>

          <Card title="История общения с клиентом">
            <NotesTimeline notes={notes} clientId={order.userId} orderId={order.id} />
          </Card>

          <Card title="Правка данных">
            <DetailsForm order={order} />
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
          <Card title="Ответственный">
            <AssigneeSelect orderId={order.id} value={order.assigneeId} admins={adminOptions} />
          </Card>
          <Card title="Оплата">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{plan?.name} × {order.quantity}</dt><dd>{formatPrice(order.itemsAmount)}</dd></div>
              {order.discountAmount ? <div className="flex justify-between text-emerald-700"><dt>Промокод {order.promoCode}</dt><dd>−{formatPrice(order.discountAmount)}</dd></div> : null}
              {order.addons.length ? <div className="flex justify-between"><dt className="text-muted">{order.addons.map(addonName).join(", ")}</dt><dd>{formatPrice(order.addonsAmount)}</dd></div> : null}
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
