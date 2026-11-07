import { addonName, coverName, deliveryName, formatName, interiorName, planName } from "@/i18n/labels";
import { channelLabel, describeAttribution, toAttribution } from "@/shared/domain/channels";
import { localeMeta } from "@/i18n/config";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Facts } from "@/components/ui/Facts";
import { localDay } from "@/modules/reporting/time";
import { notFound } from "next/navigation";
import { container } from "@/server/container";
import { formatPrice, getPlan, isQuotedDelivery } from "@/config/site";
import { deliveryAddress } from "@/modules/ordering/ui/labels";
import { orderStatusLabel, orderStatusTone, isPrintedPlan } from "@/modules/ordering/ui/status";
import { getTheme } from "@/lib/content/themes";
import { bookKind } from "@/lib/content/kinds";
import { getFormat } from "@/lib/book/formats";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { DetailsForm, LockButton, NextStep, NoteForm, OrderMoney, PrintFileActions, StatusForm, TermsForm } from "./OrderControls";
import { OrderMenu } from "./OrderMenu";
import { ProductionRuler } from "./ProductionRuler";
import { Disclosure } from "./Disclosure";
import { discountLimit } from "@/server/discount";
import { getPlans } from "@/config/site";
import { AssigneeSelect, NotesTimeline, TaskList, type NoteItem, type TaskItem } from "@/components/admin/CrmWidgets";
import { staffOptions } from "@/modules/access/ui";
import { staffLabel } from "@/shared/domain/staff";
import { CalendarClock, CircleDollarSign, Gift, History } from "lucide-react";
import { can, canSeeOrder, contactView, requireStaff } from "@/server/access";
import { ContactActions } from "@/components/admin/ContactActions";
import { formatPhone } from "@/shared/domain/phone";
import { pageId } from "@/server/input";
import { isPhoneEmail } from "@/modules/identity/domain";
import type { OrderNoticeFacts } from "@/modules/ordering/ui/notice";

/** Способ оплаты заказа — по-человечески, а не код платёжной системы. */
const PROVIDER_LABEL: Record<string, string> = { manual: "перевод или вручную", kaspi: "Kaspi", cloudpayments: "карта (CloudPayments)" };

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

/**
 * Карточка заказа — «Разворот» (DESIGN.md §7.2). В шапке: номер, статус, следующий шаг и меню «Ещё»; под ней линейка
 * производства с датами этапов и четыре главных факта. Слева — то, чем занимаются: оплата, книга и файлы для типографии,
 * доставка со сменой статуса, получатель; справа (липкая колонка) — контекст: кто ведёт и связанная сделка, задачи, заметка,
 * переписка и журнал. Телефон — одна колонка, контекст ниже.
 */
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("orders.view");
  const id = pageId((await params).id);
  const order = await container().ordering.queries.orderDetails(id);
  // Чужой заказ у роли «только свои» — как будто его нет.
  if (!order || !(await canSeeOrder(staff, order.id))) notFound();
  const plan = getPlan(order.plan);
  const book = order.book;
  const [stats, admins, { taskRows, noteRows, clientStats, deal: orderDeal }, kaspiInvoices, moneyRows, built] = await Promise.all([
    container().authoring.queries.stats(book),
    container().access.queries.allStaff(),
    container().reporting.orderCrm(order),
    container().ordering.queries.paymentInvoices("order", order.id),
    container().ordering.payments.list(order.id),
    // Макет, который видит клиент (экранная сборка текущей книги), — если собран.
    container().previews.current(book.id).catch(() => null),
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
  // Тариф и цену меняют, пока заказ не оплачен: дальше деньги уже учтены.
  const termsOpen = canEdit && order.status !== "cancelled" && !order.paidAt;
  const maxDiscount = termsOpen ? await discountLimit(staff) : null;
  // Договорённая цена первого экземпляра: скидка заказа без промокода — это и есть договорённость.
  const agreedNow = order.discountAmount > 0 && !order.promoCode && plan ? order.itemsAmount - order.discountAmount - (order.itemsAmount - plan.price) : null;
  const printed = isPrintedPlan(order.plan);
  const kind = bookKind(book.theme);
  // Сколько дней до даты, к которой нужна книга (по дню магазина): срок — главное для производства.
  const daysLeft = order.desiredDate ? Math.round((new Date(`${order.desiredDate}T00:00:00`).getTime() - localDay(0).getTime()) / 86_400_000) : null;
  const open = order.status !== "delivered" && order.status !== "cancelled";
  const dueTone = daysLeft === null || !open ? "neutral" : daysLeft < 0 ? "danger" : daysLeft <= 3 ? "warning" : "neutral";
  const dueText = daysLeft === null ? null : daysLeft < 0 ? `просрочено на ${-daysLeft} дн.` : daysLeft === 0 ? "сегодня" : `через ${daysLeft} дн.`;
  const assignee = order.assigneeId ? (adminName.get(order.assigneeId) ?? "—") : null;
  const paidInFull = order.receivedAmount >= order.amount && order.amount > 0;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        back={{ href: "/admin/orders", label: "Заказы" }}
        title={`Заказ №${order.number}`}
        meta={
          <>
            <Badge tone={orderStatusTone[order.status]} dot>
              {orderStatusLabel(order.status, "ru", printed)}
            </Badge>
            {order.paymentClaimedAt && order.status === "pending_payment" ? (
              <Badge tone="warning">
                <CircleDollarSign className="size-3" aria-hidden /> клиент сообщил об оплате {formatDate(order.paymentClaimedAt, true)}
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            {canEdit && notice ? <NextStep orderId={order.id} status={order.status} printed={printed} trackingNumber={order.trackingNumber} notice={notice} /> : null}
            <OrderMenu
              clientHref={canClients ? `/admin/clients/${order.userId}` : undefined}
              dealHref={orderDeal ? `/admin/deals/${orderDeal.id}` : undefined}
              dealLabel={orderDeal ? `Сделка №${orderDeal.number}` : undefined}
              chatHref={orderDeal?.conversationId ? `/admin/chats?c=${orderDeal.conversationId}` : undefined}
              previewHref={`/books/${book.id}/preview`}
              printHref={plan?.printed ? `/print/orders/${order.id}` : undefined}
            />
          </>
        }
      />

      {order.surprise ? (
        <Alert kind="warning">
          <b className="font-semibold">Сюрприз.</b> Не звонить получателю, связываться с заказчиком ({accountEmail}).
        </Alert>
      ) : null}

      {/* Линейка производства и главное о заказе одним листом: где заказ сейчас, сколько, что за книга, к какому числу, кто ведёт. */}
      <section className="panel overflow-hidden" aria-label="Ход заказа">
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <ProductionRuler status={order.status} printed={printed} createdAt={order.createdAt} events={order.events.map((e) => ({ status: e.status, createdAt: e.createdAt }))} />
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
          <Fact label="Сумма">
            <span className="text-[20px] font-semibold tabular-nums">{formatPrice(order.amount)}</span>
            <span className={cn("block text-xs", paidInFull ? "text-success" : "text-muted")}>
              {order.amount === 0 ? "бесплатный заказ" : paidInFull ? "оплачено полностью" : `получено ${formatPrice(order.receivedAmount)}`}
            </span>
          </Fact>
          <Fact label="Книга">
            <span className="block truncate font-medium">
              {planName(order.plan)}
              {order.quantity > 1 ? ` × ${order.quantity}` : ""}
            </span>
            <span className="block truncate text-xs text-muted">{printed ? deliveryName(order.deliveryMethod) || "доставка не выбрана" : "электронная версия"}</span>
          </Fact>
          <Fact label="Нужна к">
            {order.desiredDate ? (
              <>
                <span className="block font-medium">{formatDate(order.desiredDate)}</span>
                {open ? (
                  <Badge tone={dueTone} className="mt-0.5">
                    <CalendarClock className="size-3" aria-hidden /> {dueText}
                  </Badge>
                ) : null}
              </>
            ) : (
              <span className="text-muted">срок не указан</span>
            )}
          </Fact>
          <Fact label="Ведёт">
            <span className={cn("block truncate font-medium", !assignee && "text-muted")}>{assignee ?? "не назначен"}</span>
            {canClients ? (
              <span className="block truncate text-xs text-muted">
                у клиента {clientStats.n} зак. на {formatPrice(clientStats.ltv)}
              </span>
            ) : null}
          </Fact>
        </dl>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-5">
        <div className="flex min-w-0 flex-col gap-4 xl:gap-5">
          <Panel flush title="Оплата" id="money" description={order.paidAt ? `Оплачен ${formatDate(order.paidAt, true)}` : "Расчёт и журнал оплат"}>
            <div className="p-4 sm:p-5">
              <div className="grid gap-6 md:grid-cols-2">
                <dl className="space-y-2 text-sm">
                  <Line label={`${planName(order.plan)} × ${order.quantity}`} value={formatPrice(order.itemsAmount)} />
                  {order.discountAmount ? <Line tone="success" label={order.promoCode ? `Промокод ${order.promoCode}` : "Договорённая цена"} value={`−${formatPrice(order.discountAmount)}`} /> : null}
                  {order.addons.length ? <Line label={order.addons.map((a) => addonName(a)).join(", ")} value={formatPrice(order.addonsAmount)} /> : null}
                  <Line label="Доставка" value={isQuotedDelivery(order.deliveryMethod) && !order.deliveryAmount ? "отдельно" : formatPrice(order.deliveryAmount)} />
                  {order.prepaidAmount ? <Line tone="success" label="Внесено ранее менеджеру" value={`−${formatPrice(order.prepaidAmount)}`} /> : null}
                  <div className="flex justify-between gap-3 border-t border-line pt-2.5 font-semibold">
                    <dt>{order.prepaidAmount ? "К оплате сейчас" : "Итого"}</dt>
                    <dd className="tabular-nums">{formatPrice(order.amount)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 pt-1 text-xs text-muted">
                    <dt>Способ оплаты</dt>
                    <dd className="truncate">
                      {PROVIDER_LABEL[order.paymentProvider] ?? order.paymentProvider}
                      {order.paymentId ? `, ${order.paymentId}` : ""}
                    </dd>
                  </div>
                </dl>
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
              </div>
              {kaspiInvoices.length ? (
                <div className="mt-5 border-t border-line pt-4">
                  <h3 className="mb-2 text-xs font-medium text-muted">Счета Kaspi</h3>
                  <ul className="divide-y divide-line text-sm">
                    {kaspiInvoices.map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                        <span className="min-w-0">
                          {i.method === "qr" ? "QR-код" : `Счёт на ${formatPhone(i.phone) || i.phone}`} <span className="text-xs text-muted tabular-nums">№{i.externalId}</span>
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted" title={i.providerStatus ?? undefined}>
                          {formatDate(i.paidAt ?? i.createdAt, true)}
                          <Badge tone={i.status === "paid" ? "success" : i.status === "pending" ? "warning" : "neutral"}>{invoiceStatusLabels[i.status]}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            {termsOpen ? (
              <Disclosure title="Тариф и цена" hint="пока заказ не оплачен">
                <div className="max-w-md">
                  <TermsForm
                    key={`${order.plan}:${order.amount}`}
                    orderId={order.id}
                    plan={order.plan}
                    agreed={agreedNow}
                    plans={getPlans().map((p) => ({ id: p.id, label: planName(p.id) + (p.hidden ? " (скрыт)" : ""), price: p.price }))}
                    maxPercent={maxDiscount}
                  />
                </div>
              </Disclosure>
            ) : null}
          </Panel>

          <Panel
            flush
            title="Книга"
            actions={
              <Link href={`/books/${book.id}/preview`} className="btn btn-ghost btn-sm">
                Предпросмотр
              </Link>
            }
          >
            <div className="p-4 sm:p-5">
              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-x-6">
                <Row label="Название" value={<span className="font-medium">{book.title}</span>} />
                <Row label="Тема" value={getTheme(book.theme).name} />
                <Row
                  label={kind === "autobiography" ? "Рассказчик" : "Автор и адресат"}
                  value={
                    <>
                      {book.authorName}
                      {book.recipientName && kind !== "autobiography" ? `, для ${book.recipientName}` : ""}
                      {book.recordedBy ? <span className="text-muted">, записано: {book.recordedBy}</span> : null}
                    </>
                  }
                />
                <Row
                  label="Оформление"
                  value={
                    <>
                      {formatName(book.format)}
                      <span className="block text-xs text-muted">
                        обложка «{coverName(book.coverTemplate)}», страницы «{interiorName(book.interior)}», язык: {localeMeta[book.language]?.label ?? book.language}
                      </span>
                    </>
                  }
                />
                <Row
                  label="Наполнение"
                  value={
                    <span className="tabular-nums">
                      {kind === "blank" ? `${stats.answered} разделов с текстом` : `${stats.answered} ответов`}, {stats.words} слов, {stats.photos} фото, {built ? `${built.pageCount} стр. по макету` : `≈ ${stats.printedPages} стр.`}
                    </span>
                  }
                />
                <Row
                  label="Редактирование"
                  value={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {book.status === "draft" ? <Badge tone="warning">открыто для клиента</Badge> : <Badge>закрыто</Badge>}
                      {canEdit ? <LockButton orderId={order.id} locked={book.status !== "draft"} /> : null}
                    </span>
                  }
                />
              </dl>
            </div>
            {can(staff, "orders.files") ? (
              <div className="border-t border-line p-4 sm:p-5">
                <h3 className="mb-3 text-sm font-semibold">Файлы для типографии</h3>
                <PrintFileActions orderId={order.id} hasFiles={!!spec} />
                {spec ? (
                  <>
                    <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-ctl)] border border-line bg-line text-sm sm:grid-cols-4">
                      <Spec label="Формат" value={getFormat(spec.format).short} />
                      <Spec label="Страниц" value={spec.pageCount} />
                      <Spec label="Корешок" value={`${spec.spineMm} мм`} />
                      <Spec label="Развёртка" value={`${spec.coverWidthMm}×${spec.coverHeightMm} мм`} />
                    </dl>
                    <p className="mt-2 text-xs text-muted">Собраны {formatDate(spec.generatedAt, true)}</p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted">Файлы ещё не собирались. Они соберутся при первом скачивании, это 15–60 секунд.</p>
                )}
                {/* Блок собран раньше правок книги или прежней вёрсткой (длинные книги после смены числа проходов) — в типографию ушли бы не те полосы, что видит клиент. */}
                {spec && built && spec.pageCount !== built.pageCount ? (
                  <Alert kind="warning" className="mt-3">
                    Клиент видит макет на {built.pageCount} стр., а файлы для печати собраны на {spec.pageCount} стр. Пересоберите их перед отправкой в типографию.
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </Panel>

          {/* Доставка слева, смена статуса справа: id="status" — к нему ведёт «Отметить отправленным» из шапки. */}
          <Panel flush title="Доставка и статус" id="status">
            <div className="grid gap-6 p-4 sm:p-5 md:grid-cols-2 md:gap-8">
              <div className="space-y-4">
                <dl className="grid content-start grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                  {plan?.printed ? (
                    <>
                      <Row
                        label="Доставка"
                        value={
                          <>
                            {deliveryName(order.deliveryMethod) || "не выбрана"}
                            {isQuotedDelivery(order.deliveryMethod) && !order.deliveryAmount ? <span className="block text-xs text-warning">стоимость рассчитывается отдельно, в сумму не входит</span> : null}
                          </>
                        }
                      />
                      <Row label="Адрес" value={deliveryAddress({ ...order, country: order.deliveryCountry }) || <span className="text-muted">не указан</span>} />
                      {order.trackingNumber ? <Row label="Трек-номер" value={<span className="font-mono text-[13px]">{order.trackingNumber}</span>} /> : null}
                    </>
                  ) : (
                    <Row label="Доставка" value={<span className="text-muted">не нужна, электронная версия</span>} />
                  )}
                  {order.desiredDate ? <Row label="Нужна к" value={<span className="font-medium text-wine">{formatDate(order.desiredDate)}</span>} /> : null}
                  {order.customerComment ? <Row label="Комментарий" value={<span className="whitespace-pre-line">{order.customerComment}</span>} /> : null}
                </dl>
                {order.giftNote ? (
                  <div className="flex gap-2.5 rounded-[var(--r-ctl)] bg-rose/60 px-3.5 py-3 text-sm">
                    <Gift className="mt-0.5 size-4 shrink-0 text-wine" aria-hidden />
                    <p className="whitespace-pre-line italic">«{order.giftNote}»</p>
                  </div>
                ) : null}
              </div>
              {canEdit && notice ? (
                <div className="md:border-l md:border-line md:pl-8">
                  <StatusForm orderId={order.id} status={order.status} trackingNumber={order.trackingNumber} printed={printed} notice={notice} />
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel flush title="Получатель">
            <div className="p-4 sm:p-5">
              <dl className="grid content-start grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-x-6">
                <Row label="Получатель" value={<span className="font-medium">{order.contactName}</span>} />
                <Row label="Телефон" value={contact.masked ? contact.phone : <a href={`tel:${order.contactPhone}`} className="text-wine hover:underline">{order.contactPhone}</a>} />
                <Row label="E-mail" value={contact.masked ? contact.email : <a href={`mailto:${order.contactEmail}`} className="break-all text-wine hover:underline">{order.contactEmail}</a>} />
                <Row label="Аккаунт" value={<span className="break-all">{accountEmail}</span>} />
                <Row
                  label="Канал"
                  value={
                    <>
                      {channelLabel(toAttribution(order.user.source))}
                      {describeAttribution(toAttribution(order.user.source)) ? <span className="block text-xs text-muted">{describeAttribution(toAttribution(order.user.source))}</span> : null}
                    </>
                  }
                />
              </dl>
              <ContactActions className="mt-4 max-w-md" target={{ orderId: order.id }} canCall={can(staff, "calls.make")} canChat={can(staff, "chats.send")} canEmail={can(staff, "chats.send") && !!order.contactEmail} />
            </div>
            {canEdit && !contact.masked ? <DetailsForm order={order} /> : null}
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[calc(var(--topbar-h)+1.25rem)] xl:max-h-[calc(100dvh-var(--topbar-h)-2.5rem)] xl:gap-5 xl:overflow-y-auto xl:pr-1">
          <Panel title="Ведёт">
            <div className="space-y-4">
              {canEdit ? <AssigneeSelect orderId={order.id} value={order.assigneeId} admins={adminOptions} /> : <p className="text-sm">{assignee ?? "Не назначен"}</p>}
              {/* Сделка заказа (deals-14): номер, ответственный и переписка — из заказа видно, кто ведёт клиента. */}
              {orderDeal ? (
                <div data-testid="order-deal">
                  <Facts
                    items={[
                      {
                        label: "Сделка",
                        value: (
                          <Link href={`/admin/deals/${orderDeal.id}`} className="text-wine hover:underline">
                            №{orderDeal.number}
                          </Link>
                        ),
                      },
                      { label: "Ведёт сделку", value: orderDeal.assigneeId ? (adminName.get(orderDeal.assigneeId) ?? "—") : <span className="text-muted">без ответственного</span> },
                      {
                        label: "Переписка",
                        hidden: !orderDeal.conversationId,
                        value: (
                          <Link href={`/admin/chats?c=${orderDeal.conversationId}`} className="text-wine hover:underline">
                            открыть чат
                          </Link>
                        ),
                      },
                    ]}
                  />
                </div>
              ) : canClients ? (
                <p className="text-sm text-muted">
                  Сделки у заказа нет. У клиента {clientStats.n} зак. на {formatPrice(clientStats.ltv)}.
                </p>
              ) : null}
            </div>
          </Panel>

          {/* Форма задачи из CrmWidgets подстраивается под ширину колонки (@container). */}
          <Panel title={<>Задачи по заказу {tasks.length ? <span className="font-normal text-muted tabular-nums">{tasks.filter((t) => !t.done).length}</span> : null}</>}>
            <TaskList tasks={tasks} admins={adminOptions} orderId={order.id} clientId={order.userId} emptyText="Задач по заказу нет. Поставьте следующий шаг ниже." />
          </Panel>

          {canEdit && notice ? (
            <Panel title="Заметка" description="Видна только сотрудникам">
              <NoteForm orderId={order.id} note={order.adminNote} />
            </Panel>
          ) : order.adminNote ? (
            <Panel title="Заметка">
              <p className="text-sm whitespace-pre-line">{order.adminNote}</p>
            </Panel>
          ) : null}

          {canClients ? (
            <Panel title="История общения">
              <NotesTimeline notes={notes} clientId={order.userId} orderId={order.id} mentionables={staffOptions(admins).filter((a) => a.id !== staff.user.id).map((a) => a.label)} />
            </Panel>
          ) : null}

          <Panel title="Журнал заказа" flush>
            {order.events.length ? (
              <ol className="relative space-y-4 px-4 py-4 before:absolute before:top-5 before:bottom-5 before:left-[1.4rem] before:w-px before:bg-line sm:px-5 sm:before:left-[1.65rem]">
                {order.events.map((e) => (
                  <li key={e.id} className="relative flex gap-3 text-sm">
                    <span className={cn("relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-white", e.status ? "bg-ink" : "bg-line-strong")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      {e.status ? <span className="font-medium">{orderStatusLabel(e.status, "ru", printed)}. </span> : null}
                      <span className="text-ink-soft">{e.note}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {formatDate(e.createdAt, true)}
                        {e.actor ? `, ${e.actor}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState compact icon={History} title="Событий пока нет">
                Смена статуса и оплаты появятся здесь.
              </EmptyState>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/** Ячейка строки «главное о заказе». */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3 sm:px-5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** Строка описания: подпись слева, значение справа (в сетке dl). */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </>
  );
}

/** Строка расчёта: подпись и сумма. */
function Line({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className={cn("flex justify-between gap-3", tone === "success" && "text-success")}>
      <dt className={tone ? undefined : "text-muted"}>{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
