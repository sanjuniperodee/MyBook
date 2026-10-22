import { addonName, coverName, deliveryName, formatName, interiorName, planName } from "@/i18n/labels";
import { channelLabel, describeAttribution, toAttribution } from "@/shared/domain/channels";
import { localeMeta } from "@/i18n/config";
import Link from "next/link";
import { BackLink } from "@/components/admin/BackLink";
import { notFound } from "next/navigation";
import { Download, FileArchive } from "lucide-react";
import { container } from "@/server/container";
import { formatPrice, getPlan, isQuotedDelivery } from "@/config/site";
import { deliveryAddress } from "@/modules/ordering/ui/labels";
import { orderStatusColors, orderStatusLabel, isPrintedPlan } from "@/modules/ordering/ui/status";
import { getTheme } from "@/lib/content/themes";
import { bookKind } from "@/lib/content/kinds";
import { getFormat } from "@/lib/book/formats";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { DetailsForm, GenerateButton, LockButton, NoteForm, OrderMoney, StatusForm } from "./OrderControls";
import { AssigneeSelect, NotesTimeline, TaskList, type NoteItem, type TaskItem } from "@/components/admin/CrmWidgets";
import { staffOptions } from "@/modules/access/ui";
import { staffLabel } from "@/shared/domain/staff";
import { ClipboardList, UserRound } from "lucide-react";
import { can, canSeeOrder, contactView, requireStaff } from "@/server/access";
import { ContactActions } from "@/components/admin/ContactActions";
import { formatPhone } from "@/shared/domain/phone";
import { pageId } from "@/server/input";
import { isPhoneEmail } from "@/modules/identity/domain";
import type { OrderNoticeFacts } from "@/modules/ordering/ui/notice";

/**
 * Что получит клиент при смене статуса: настоящая ли почта, правила WhatsApp о заказе (о чём уже писали), переписка,
 * стоп-лист, рабочее ли время и открыты ли окно и суточный лимит сообщений от правил.
 */
async function noticeFacts(order: { id: string; userId: string; contactEmail: string; contactPhone: string; trackingNumber: string | null }): Promise<OrderNoticeFacts> {
  const n = await container().reporting.orderNotice(order);
  const [noMarketing, pause, workTime] = await Promise.all([
    container().messaging.chats.noMarketingFor({ dealId: n.dealId, clientId: order.userId, phones: [order.contactPhone] }),
    n.rules.length ? container().messaging.chats.ruleSendPause() : null,
    n.rules.some((r) => r.hours) ? container().workspace.schedule.isWorkTime(new Date()) : true,
  ]);
  return { realEmail: !isPhoneEmail(order.contactEmail), rules: n.rules, whatsappChat: n.whatsappChat, noMarketing, workTime, pause };
}

/** Статусы счетов Kaspi в карточке заказа. */
const invoiceStatusLabels = { pending: "ждёт оплаты", paid: "оплачен", failed: "не прошёл", cancelled: "отменён", expired: "истёк" } as const;

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("orders.view");
  const id = pageId((await params).id);
  const order = await container().ordering.queries.orderDetails(id);
  // Чужой заказ у роли «только свои» — как будто его нет.
  if (!order || !(await canSeeOrder(staff, order.id))) notFound();
  const plan = getPlan(order.plan);
  const book = order.book;
  const [stats, admins, { taskRows, noteRows, clientStats }, kaspiInvoices, moneyRows] = await Promise.all([
    container().authoring.queries.stats(book),
    container().access.queries.allStaff(),
    container().reporting.orderCrm(order),
    container().ordering.queries.paymentInvoices("order", order.id),
    container().ordering.payments.list(order.id),
  ]);
  const adminOptions = staffOptions(admins);
  const adminName = new Map(admins.map((a) => [a.id, staffLabel(a)]));
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
  const contact = contactView(staff, { phone: order.contactPhone, email: order.contactEmail });
  const accountEmail = contactView(staff, { email: order.user.email }).email;
  const canEdit = can(staff, "orders.edit");
  const notice = canEdit ? await noticeFacts(order) : null;
  const canClients = can(staff, "clients.view");
  const file = (kind: string) => `/api/orders/${order.id}/files/${kind}`;

  return (
    <div className="space-y-6">
      <BackLink href="/admin/orders">Заказы</BackLink>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Заказ №{order.number}</h1>
        <span className={cn("rounded-full px-3 py-1 text-sm", orderStatusColors[order.status])}>{orderStatusLabel(order.status, "ru", isPrintedPlan(order.plan))}</span>
        {order.paymentClaimedAt && order.status === "pending_payment" ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">Клиент сообщил об оплате {formatDate(order.paymentClaimedAt, true)}</span>
        ) : null}
        <div className="ml-auto flex gap-2">
          {canClients ? (
            <Link href={`/admin/clients/${order.userId}`} className="btn btn-outline btn-sm">
              <UserRound className="size-4" /> Клиент · {clientStats.n} зак. · {formatPrice(clientStats.ltv)}
            </Link>
          ) : null}
          {plan?.printed ? (
            <a href={`/print/orders/${order.id}`} target="_blank" rel="noopener" className="btn btn-outline btn-sm">
              <ClipboardList className="size-4" /> Упаковочный лист
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {can(staff, "orders.files") ? (
          <Card title="Файлы для типографии">
            <div className="flex flex-wrap gap-2">
              <a href={`/api/admin/orders/${order.id}/package`} className="btn btn-primary btn-sm"><FileArchive className="size-4" /> Скачать всё (ZIP)</a>
              <a href={file("block")} className="btn btn-outline btn-sm"><Download className="size-4" /> Блок</a>
              <a href={file("cover")} className="btn btn-outline btn-sm"><Download className="size-4" /> Обложка</a>
              <a href={file("layout")} className="btn btn-outline btn-sm"><Download className="size-4" /> Каркас обложки</a>
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
          ) : null}

          <Card title="Книга">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-muted">Название</dt><dd>{book.title}</dd>
              <dt className="text-muted">Тема</dt><dd>{getTheme(book.theme).name}</dd>
              <dt className="text-muted">{bookKind(book.theme) === "autobiography" ? "Рассказчик" : "Автор → адресат"}</dt><dd>{book.authorName}{book.recipientName && bookKind(book.theme) !== "autobiography" ? ` → ${book.recipientName}` : ""}{book.recordedBy ? ` · записано: ${book.recordedBy}` : ""}</dd>
              <dt className="text-muted">Оформление</dt><dd>{formatName(book.format)} · обложка «{coverName(book.coverTemplate)}» · страницы «{interiorName(book.interior)}» · язык книги: {localeMeta[book.language]?.label ?? book.language}</dd>
              <dt className="text-muted">Наполнение</dt><dd>{bookKind(book.theme) === "blank" ? `${stats.answered} разделов с текстом` : `${stats.answered} ответов`} · {stats.words} слов · {stats.photos} фото · ≈ {stats.printedPages} стр.</dd>
              <dt className="text-muted">Редактирование</dt><dd>{book.status === "draft" ? "открыто для клиента" : "закрыто"}</dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/books/${book.id}/preview`} className="btn btn-outline btn-sm">Предпросмотр</Link>
              {canEdit ? <LockButton orderId={order.id} locked={book.status !== "draft"} /> : null}
            </div>
          </Card>

          <Card title="Клиент и доставка">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
              <dt className="text-muted">Получатель</dt><dd>{order.contactName}</dd>
              <dt className="text-muted">Телефон</dt><dd>{contact.masked ? contact.phone : <a href={`tel:${order.contactPhone}`} className="underline">{order.contactPhone}</a>}</dd>
              <dt className="text-muted">E-mail</dt><dd>{contact.masked ? contact.email : <a href={`mailto:${order.contactEmail}`} className="underline">{order.contactEmail}</a>}</dd>
              <dt className="text-muted">Аккаунт</dt><dd>{accountEmail}</dd>
              <dt className="text-muted">Канал</dt>
              <dd>
                {channelLabel(toAttribution(order.user.source))}
                {describeAttribution(toAttribution(order.user.source)) ? <span className="text-muted"> · {describeAttribution(toAttribution(order.user.source))}</span> : null}
              </dd>
              {plan?.printed ? (
                <>
                  <dt className="text-muted">Доставка</dt><dd>{deliveryName(order.deliveryMethod)}{isQuotedDelivery(order.deliveryMethod) && !order.deliveryAmount ? <span className="ml-1.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">стоимость рассчитывается индивидуально — в сумму не входит</span> : null}</dd>
                  <dt className="text-muted">Адрес</dt><dd>{deliveryAddress({ ...order, country: order.deliveryCountry }) || "—"}</dd>
                </>
              ) : null}
              {order.customerComment ? (<><dt className="text-muted">Комментарий</dt><dd className="whitespace-pre-line">{order.customerComment}</dd></>) : null}
              {order.giftNote ? (<><dt className="text-muted">Открытка</dt><dd className="whitespace-pre-line italic">«{order.giftNote}»</dd></>) : null}
              {order.desiredDate ? (<><dt className="text-muted">Нужна к</dt><dd className="font-medium text-wine">{formatDate(order.desiredDate)}</dd></>) : null}
              {order.surprise ? (<><dt className="text-muted">Сюрприз</dt><dd className="font-medium text-wine">Не звонить получателю, связываться с заказчиком ({accountEmail})</dd></>) : null}
            </dl>
            <ContactActions className="mt-4 max-w-sm" target={{ orderId: order.id }} canCall={can(staff, "calls.make")} canChat={can(staff, "chats.send")} canEmail={can(staff, "chats.send") && !!order.contactEmail} />
          </Card>

          <Card title="Задачи по заказу">
            <TaskList tasks={tasks} admins={adminOptions} orderId={order.id} clientId={order.userId} emptyText="Задач по заказу нет" />
          </Card>

          {canClients ? (
            <Card title="История общения с клиентом">
              <NotesTimeline notes={notes} clientId={order.userId} orderId={order.id} mentionables={staffOptions(admins).filter((a) => a.id !== staff.user.id).map((a) => a.label)} />
            </Card>
          ) : null}

          {canEdit && !contact.masked ? (
            <Card title="Правка данных">
              <DetailsForm order={order} />
            </Card>
          ) : null}

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
            {canEdit ? <AssigneeSelect orderId={order.id} value={order.assigneeId} admins={adminOptions} /> : <p className="text-sm">{order.assigneeId ? adminName.get(order.assigneeId) : "Не назначен"}</p>}
          </Card>
          <Card title="Оплата">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{planName(order.plan)} × {order.quantity}</dt><dd>{formatPrice(order.itemsAmount)}</dd></div>
              {order.discountAmount ? <div className="flex justify-between text-emerald-700"><dt>{order.promoCode ? `Промокод ${order.promoCode}` : "Договорённая цена"}</dt><dd>−{formatPrice(order.discountAmount)}</dd></div> : null}
              {order.addons.length ? <div className="flex justify-between"><dt className="text-muted">{order.addons.map((a) => addonName(a)).join(", ")}</dt><dd>{formatPrice(order.addonsAmount)}</dd></div> : null}
              <div className="flex justify-between"><dt className="text-muted">Доставка</dt><dd>{isQuotedDelivery(order.deliveryMethod) && !order.deliveryAmount ? "рассчитывается индивидуально, отдельно" : formatPrice(order.deliveryAmount)}</dd></div>
              {order.prepaidAmount ? <div className="flex justify-between text-emerald-700"><dt>Внесено ранее менеджеру (предоплата)</dt><dd>−{formatPrice(order.prepaidAmount)}</dd></div> : null}
              <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>{order.prepaidAmount ? "К оплате сейчас" : "Итого"}</dt><dd>{formatPrice(order.amount)}</dd></div>
              <div className="flex justify-between pt-2 text-xs text-muted"><dt>Способ</dt><dd>{order.paymentProvider}{order.paymentId ? ` · ${order.paymentId}` : ""}</dd></div>
              {order.paidAt ? <div className="flex justify-between text-xs text-muted"><dt>Оплачен</dt><dd>{formatDate(order.paidAt, true)}</dd></div> : null}
            </dl>
            {kaspiInvoices.length ? (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1.5 text-xs text-muted">Счета Kaspi</div>
                <ul className="space-y-1 text-xs">
                  {kaspiInvoices.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span>
                        {i.method === "qr" ? "QR" : `счёт на ${formatPhone(i.phone) || i.phone}`} · №{i.externalId}
                      </span>
                      <span className={i.status === "paid" ? "text-emerald-700" : "text-muted"} title={i.providerStatus ?? undefined}>
                        {invoiceStatusLabels[i.status]} {formatDate(i.paidAt ?? i.createdAt, true)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
          <Card title="Деньги по заказу" id="money">
            <OrderMoney
              orderId={order.id}
              status={order.status}
              due={order.amount}
              received={order.receivedAmount}
              postpay={order.postpay}
              settled={!!order.paidAt}
              canEdit={canEdit}
              canReview={can(staff, "team.manage")}
              rows={moneyRows.map((r) => ({
                id: r.id,
                amount: r.amount,
                method: r.method,
                ref: r.externalRef,
                paidLabel: formatDate(r.paidAt),
                note: r.note,
                receipt: !!r.receipt,
                reviewed: r.reviewedAt ? `${r.reviewedById ? (adminName.get(r.reviewedById) ?? "") : ""} ${formatDate(r.reviewedAt)}`.trim() : null,
                by: r.createdById ? (adminName.get(r.createdById) ?? null) : null,
              }))}
            />
          </Card>
          {canEdit && notice ? (
            <>
              <Card title="Управление">
                <StatusForm orderId={order.id} status={order.status} trackingNumber={order.trackingNumber} printed={isPrintedPlan(order.plan)} notice={notice} />
              </Card>
              <Card title="Заметка">
                <NoteForm orderId={order.id} note={order.adminNote} />
              </Card>
            </>
          ) : order.adminNote ? (
            <Card title="Заметка">
              <p className="text-sm whitespace-pre-line">{order.adminNote}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-2xl border border-line bg-white p-5">
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
