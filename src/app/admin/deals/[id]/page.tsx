import { container } from "@/server/container";
import { listFields } from "@/modules/workspace";
import Link from "next/link";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { ChatAvatar } from "@/components/admin/chat/Inbox";
import { StageLabel } from "../StageLabel";
import { notFound } from "next/navigation";
import { can, canAssignOthers, canSeeAssigned, canWork, contactView, requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { staffLabel } from "@/shared/domain/staff";
import { dealSourceLabels } from "@/shared/domain/dealSources";
import { channelLabel } from "@/modules/messaging";
import { mentionableStaff } from "@/modules/workspace";
import { formatPhone, normalizePhone } from "@/shared/domain/phone";
import { storeTimeZone } from "@/shared/domain/time";
import { NotesTimeline, TaskList } from "@/components/admin/CrmWidgets";
import { dealScreen } from "@/modules/reporting/ui/deal-screen";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { REJECTION_TAGS, mergeRefusal } from "@/modules/sales/domain";
import { mergeCancels } from "@/modules/ordering";
import { ContactActions } from "@/components/admin/ContactActions";
import { NoMarketingToggle } from "@/components/admin/NoMarketingToggle";
import { formatDate } from "@/lib/dates";
import { formatPrice } from "@/config/site";
import { invoiceViews } from "@/app/admin/invoices/view";
import { RECENT_ONLINE_MS, type MoneyGuard } from "@/components/admin/invoices/model";
import { DealAi } from "./DealAi";
import { PaymentsPanel } from "./PaymentsPanel";
import { CreateClientFromDeal, DealAssignee, DealDelete, DealFields, PipelineSwitch, RevealContact, StageBar, UnsortedBanner } from "./DealControls";
import { DealBooks, DealCalls, DealLinks, Duplicates, NotesTimelineReadonly, PastDeals } from "./sections";
import { pageId } from "@/server/input";
import { discountLimit } from "@/server/discount";

export const metadata = { title: "Сделка" };

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pay?: string | string[] }> }) {
  const staff = await requireStaff("deals.view");
  const id = pageId((await params).id);
  // «Оплата пришла» из чата: ?pay=<счёт> открывает приём платежа по этому счёту.
  const payParam = (await searchParams).pay;
  const payInvoiceId = typeof payParam === "string" && /^[0-9a-f-]{36}$/i.test(payParam) ? payParam : null;
  const deal = await container().reporting.dealById(id);
  const batch = deal ? await container().sales.batch.of(deal.id) : [];
  if (!deal || !canSeeAssigned(staff, deal.assigneeId)) notFound();

  const [allStages, pipelines, admins, { noteRows, taskRows, callRows, convs, client, order, bookRows }] = await Promise.all([
    container().sales.queries.listStages(),
    container().sales.queries.listPipelines(),
    container().access.queries.allStaff(),
    container().reporting.dealCard(deal, { calls: can(staff, "calls.view"), chats: can(staff, "chats.view") }),
  ]);
  const conv = convs[0] ?? null;
  const [paymentRows, receiptRows, orderMoney, invoiceRows] = await Promise.all([
    container().sales.payments.list(deal.id),
    container().sales.receipts.list(deal.id),
    deal.orderId ? container().ordering.payments.summary(deal.orderId) : null,
    container().ordering.invoices.listFor(deal.id),
  ]);
  const methodName = { manual: "перевод", kaspi: "Kaspi", cloudpayments: "карта" } as const;
  const orderMoneyView = orderMoney ? { due: orderMoney.due, received: orderMoney.received, postpay: orderMoney.postpay, rows: orderMoney.rows.map((r) => ({ id: r.id, amount: r.amount, method: methodName[r.method], dateLabel: formatDate(r.paidAt), receipt: !!r.receipt })) } : null;
  const [duplicates, suggestedClientId, dealFields, agreedPlan, maxDiscount, noMarketing, mergeDays] = await Promise.all([
    container().sales.queries.duplicates(deal),
    !deal.clientId && deal.contactPhone ? container().sales.deals.findClientByPhone(deal.contactPhone) : null,
    listFields("deal"),
    container().sales.agreedPlan.get(deal.id),
    discountLimit(staff),
    container().messaging.chats.noMarketingFor({ dealId: deal.id, clientId: deal.clientId, phones: [deal.contactPhone, ...deal.extraPhones] }),
    container().sales.deals.mergeClosedDays(),
  ]);
  const suggested = suggestedClientId ? await container().reporting.clientBrief(suggestedClientId) : null;
  const clientSeen = client?.lastSeenAt ?? null;
  const chat = container().messaging.view;
  const [messages, templates, vars, blocker, offers] = conv
    ? await Promise.all([chat.messages(conv.id), chat.templates(staff.user.id), chat.vars(conv, staffLabel(staff.user)), chat.sendBlocker(conv), container().marketing.service.chatOffers(conv.clientId, can(staff, "promo.give"))])
    : [[], [], null, null, null];
  const [ai, kaspiWarning] = await Promise.all([container().assistant.service.configured(), conv ? container().ordering.kaspiWatch.warning().catch(() => null) : null]);
  const mentionables = (await mentionableStaff()).filter((m) => m.id !== staff.user.id).map((m) => m.label);

  const canEdit = can(staff, "deals.edit");
  // Счета из чата: действия — тому, кто ведёт сделку (сервер проверяет те же права).
  const works = canWork(staff, deal.assigneeId);
  const invoicePerms = { edit: canEdit && works, send: canEdit && works && can(staff, "chats.send"), access: works && can(staff, "clients.create"), pay: canEdit && works && !deal.orderId };
  const now = new Date();
  const invoices = invoiceViews(invoiceRows, { now, withLink: invoicePerms.edit });
  const invoiceLabels = new Map(invoiceRows.map((i) => [i.id, i.label]));
  const openInvoice = invoiceRows.find((i) => i.status === "pending_payment") ?? null;
  // Защита от двойной записи: открытый счёт и онлайн-оплаты за 72 ч — в форме приёма платежа явный выбор.
  const guard: MoneyGuard = {
    invoice: openInvoice ? { id: openInvoice.id, label: openInvoice.label, amount: openInvoice.amount } : null,
    recentOnline: paymentRows
      .filter((p) => p.method !== "manual" && p.kind !== "refund" && now.getTime() - p.paidAt.getTime() < RECENT_ONLINE_MS)
      .map((p) => ({ id: p.id, text: `${formatPrice(p.amount)} (${p.method === "kaspi" ? "Kaspi" : "картой"}${p.invoiceId && invoiceLabels.has(p.invoiceId) ? `, счёт ${invoiceLabels.get(p.invoiceId)}` : ""}, ${formatDate(p.paidAt, true)})` })),
  };
  const contact = contactView(staff, { phone: deal.contactPhone ? formatPhone(deal.contactPhone) : client?.phone, email: deal.contactEmail ?? client?.email });
  // Готовый текст клиенту (правило «праздник») открывается в WhatsApp с номером, только если сотрудник номер видит.
  const whatsappTo = contact.masked ? null : normalizePhone(deal.contactPhone ?? client?.phone) || null;
  const screen = dealScreen({ deal, stages: allStages, staff: admins, tasks: taskRows, notes: noteRows, payments: paymentRows, receipts: receiptRows, calls: callRows, now });
  const invoiceOf = new Map(paymentRows.map((p) => [p.id, p.invoiceId ? (invoiceLabels.get(p.invoiceId) ?? null) : null]));
  const payments = screen.payments.map((p) => ({ ...p, invoice: invoiceOf.get(p.id) ?? null }));
  const { pipelineId, stages, stage, tasks, notes } = screen;
  const options = canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id || a.id === deal.assigneeId);
  // Другие открытые сделки контакта: «Объединить сюда» — по правилу продаж (в закрытую — только заявку той же покупки), а в
  // подтверждении — счета, которые слияние отменит (то же правило, что у переноса счетов: mergeCancels).
  const closed = !!stage && stage.kind !== "open";
  const closeOpen = !!deal.orderId || closed;
  const targetSide = { kind: stage?.kind ?? null, orderId: deal.orderId, createdAt: deal.createdAt, closedAt: deal.closedAt };
  const openDeals = await Promise.all(
    duplicates.open.map(async (r) => {
      const allowed = can(staff, "deals.edit", "deals.delete") && canSeeAssigned(staff, r.deal.assigneeId) && !mergeRefusal(targetSide, { kind: r.stage.kind, orderId: r.deal.orderId, createdAt: r.deal.createdAt, closedAt: r.deal.closedAt }, mergeDays);
      if (!allowed) return { ...r, merge: null };
      const theirs = closeOpen || openInvoice ? await container().ordering.invoices.listFor(r.deal.id) : [];
      return { ...r, merge: { cancels: mergeCancels([...invoiceRows, ...theirs], r.deal.id, closeOpen).map((i) => `${i.label} на ${formatPrice(i.snapshot().amount)}`) } };
    }),
  );

  const canReveal = can(staff, "clients.reveal") && canWork(staff, deal.assigneeId);
  const extraPhones = contact.masked ? [] : deal.extraPhones.map((p) => formatPhone(p));
  const showCreateClient = !deal.clientId && !suggested && !!deal.contactPhone && can(staff, "clients.create") && canWork(staff, deal.assigneeId);
  const gifts = await container().sales.agreedGifts.get(deal.id);
  const refundAfterOrder = deal.orderId ? await container().sales.refundAfterOrder(deal.id) : null;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        back={{ href: "/admin/deals", label: "Сделки" }}
        title={
          <span className="break-words">
            <span className="font-normal text-muted tabular-nums">№{deal.number}</span> {deal.title}
          </span>
        }
        meta={
          <>
            {stage ? <StageLabel name={stage.name} color={stage.color} className="text-[13px]" /> : null}
            {stage?.kind === "lost" && deal.lostReason ? <Badge tone="danger">Отказ: {deal.lostReason}</Badge> : null}
            {deal.repeatCount > 0 ? (
              <span className="badge badge-info" title={`Покупок до этой сделки: ${deal.repeatCount}`} data-testid="deal-repeat">
                повторный клиент
              </span>
            ) : null}
          </>
        }
      >
        Создана {formatDate(deal.createdAt, true)}, источник: {dealSourceLabels[deal.source]}
      </PageHeader>

      {deal.unsorted ? <UnsortedBanner dealId={deal.id} canEdit={canEdit && canWork(staff, deal.assigneeId)} canDecide={can(staff, "deals.delete")} request={deal.tags.includes(REJECTION_TAGS.spam) ? "spam" : deal.tags.includes(REJECTION_TAGS.reject) ? "reject" : null} /> : null}
      {openDeals.length ? <Duplicates dealId={deal.id} closed={closed} duplicates={openDeals} /> : null}

      <section className="panel flex flex-col gap-2 p-1.5 sm:flex-row sm:items-center" aria-label="Этап и воронка">
        <div className="min-w-0 flex-1">
          <StageBar dealId={deal.id} current={deal.stageId} stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))} disabled={!canEdit} />
        </div>
        {pipelines.length > 1 ? (
          <div className="shrink-0 border-line px-2 pb-1.5 sm:border-l sm:py-1 sm:pl-3">
            <PipelineSwitch dealId={deal.id} value={pipelineId ?? ""} pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))} disabled={!canEdit} />
          </div>
        ) : null}
      </section>

      {/*
        Ноутбук (≥1280): слева — что за сделка и действия (контакт, деньги, детали), справа — контекст (задачи, переписка,
        история). Уже — одна колонка по важности: контакт, задачи, переписка, деньги, детали, история (order на листах).
      */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:items-start xl:gap-5">
        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
          <Panel
            title="Контакт"
            className="max-xl:order-1"
            actions={client && can(staff, "clients.view") ? <Link href={`/admin/clients/${client.id}`} className="btn btn-ghost btn-sm">Карточка клиента</Link> : null}
          >
            <div className="flex items-start gap-3.5">
              <ChatAvatar name={deal.contactName || "?"} url={null} size={48} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate text-[15px] font-semibold">{deal.contactName || "Без имени"}</div>
                {contact.masked ? (
                  <div className="mt-0.5 space-y-0.5 text-ink-soft" title="Контакты скрыты настройками вашей роли">
                    <RevealContact dealId={deal.id} masked={{ phone: contact.phone ?? "", email: contact.email ?? "" }} canReveal={canReveal} />
                  </div>
                ) : (
                  <div className="mt-0.5 space-y-0.5">
                    {contact.phone ? (
                      <a href={`tel:${normalizePhone(contact.phone) ? `+${normalizePhone(contact.phone)}` : contact.phone}`} className="block w-fit text-ink-soft tabular-nums hover:text-wine">
                        {contact.phone}
                      </a>
                    ) : (
                      <span className="block text-muted">Телефона нет</span>
                    )}
                    {extraPhones.length ? <span className="block text-xs text-muted tabular-nums">ещё: {extraPhones.join(", ")}</span> : null}
                    {contact.email ? <span className="block truncate text-muted">{contact.email}</span> : null}
                  </div>
                )}
              </div>
            </div>
            <ContactActions className="mt-4" target={{ dealId: deal.id }} canCall={can(staff, "calls.make")} canChat={can(staff, "chats.send") && !conv} canEmail={can(staff, "chats.send") && !!(deal.contactEmail || client?.email)} />
            <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6">
              <div className="min-w-0">
                <dt className="label text-xs">Ответственный</dt>
                <dd>
                  <DealAssignee dealId={deal.id} value={deal.assigneeId} options={options} disabled={!canEdit} />
                </dd>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3 sm:block">
                <dt className="text-xs font-medium text-ink-soft sm:mb-1.5" title="Клиент просил не писать: бот не напоминает о себе, правила автоматизаций не пишут. На его сообщения отвечать можно.">
                  Писать первым
                </dt>
                <dd className="flex min-h-10 items-center">
                  <NoMarketingToggle target={{ dealId: deal.id }} on={noMarketing} disabled={!canEdit || !works} />
                </dd>
              </div>
            </dl>
          </Panel>

          {batch.length > 1 ? (
            <section className="rounded-[14px] border border-success/25 bg-success-bg px-4 py-3.5 text-sm text-success max-xl:order-2 sm:px-5" data-testid="deal-batch">
              <h2 className="font-semibold">Пакет: {batch.length} кн. оплачено сразу</h2>
              <p className="mt-0.5 text-xs">Клиент оформляет книги по очереди — каждая забирает свою сделку (цена и предоплата делятся поровну).</p>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {batch.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/deals/${b.id}`} aria-current={b.id === deal.id ? "page" : undefined} className={cn("chip h-8 text-xs", b.id === deal.id && "chip-on")}>
                      {b.index + 1}/{b.size} · №{b.number}
                      {b.hasOrder ? " · заказ оформлен" : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="max-xl:order-5">
            <PaymentsPanel
              dealId={deal.id}
              agreed={deal.amount}
              plan={agreedPlan}
              gifts={gifts}
              canEdit={canEdit}
              order={order ? { id: order.id, number: order.number } : null}
              payments={payments}
              canDelete={can(staff, "deals.delete")}
              orderMoney={orderMoneyView}
              invoices={invoices}
              invoicePerms={invoicePerms}
              guard={guard}
              payInvoiceId={payInvoiceId}
              canIssue={invoicePerms.send}
              refundAfterOrder={refundAfterOrder}
            />
          </div>

          <Panel title="Детали сделки" description="Бюджет, источник, свои поля и теги" className="max-xl:order-6" actions={can(staff, "deals.delete") ? <DealDelete id={deal.id} number={deal.number} /> : null}>
            <DealFields
              deal={{
                id: deal.id,
                title: deal.title,
                amount: deal.amount,
                source: deal.source,
                contactName: deal.contactName,
                contactPhone: contact.masked ? "" : (deal.contactPhone ?? ""),
                contactEmail: contact.masked ? "" : (deal.contactEmail ?? ""),
                extraPhones,
                tags: deal.tags,
              }}
              masked={contact.masked ? { phone: contact.phone, email: contact.email } : null}
              canReveal={canReveal}
              fields={dealFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))}
              values={deal.customFields}
              disabled={!canEdit}
              pricing={deal.orderId ? null : { plan: agreedPlan, maxPercent: maxDiscount }}
            />
          </Panel>

          {bookRows.length ? (
            <div className="max-xl:order-7">
              <DealBooks books={bookRows} seen={clientSeen} />
            </div>
          ) : null}
          <div className="max-xl:order-8">
            <DealLinks
              dealId={deal.id}
              channel={screen.channel}
              client={client}
              suggested={suggested}
              order={order}
              convs={convs}
              canEdit={canEdit}
              can={(p) => can(staff, p)}
              emailOf={(email) => contactView(staff, { email }).email}
            >
              {showCreateClient ? <CreateClientFromDeal dealId={deal.id} name={deal.contactName.startsWith("…") ? "" : deal.contactName} /> : null}
            </DealLinks>
          </div>
          {duplicates.past.length ? (
            <div className="max-xl:order-11">
              <PastDeals deals={duplicates.past} canSee={(assigneeId) => canSeeAssigned(staff, assigneeId)} />
            </div>
          ) : null}
        </div>

        <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-5">
          <Panel
            title={
              <>
                Задачи {tasks.filter((t) => !t.done).length ? <span className="font-normal text-muted tabular-nums">{tasks.filter((t) => !t.done).length}</span> : null}
              </>
            }
            className="max-xl:order-2"
          >
            <TaskList tasks={tasks} admins={options} dealId={deal.id} clientId={deal.clientId ?? undefined} emptyText="Задач нет — запланируйте следующий шаг, чтобы сделка не потерялась" />
          </Panel>

          {ai ? (
            <div className="max-xl:order-3">
              <DealAi dealId={deal.id} summary={deal.aiSummary ?? null} summaryAt={deal.aiSummary ? formatDate(new Date(deal.aiSummary.at), true) : null} canEdit={canEdit} />
            </div>
          ) : null}

          {conv && vars ? (
            <Panel
              flush
              className="overflow-hidden max-xl:order-4"
              title={`Переписка: ${channelLabel(conv.channel)}`}
              actions={
                <Link href={`/admin/chats?c=${conv.id}`} className="btn btn-ghost btn-sm">
                  Открыть в чатах
                </Link>
              }
            >
              <ChatPanel
                className="h-[70dvh] max-h-[620px] xl:h-[520px] xl:max-h-none"
                conversationId={conv.id}
                messages={messages}
                canSend={can(staff, "chats.send") && canWork(staff, deal.assigneeId)}
                templates={templates}
                vars={vars}
                sendDisabledReason={blocker}
                paymentWarning={invoicePerms.send ? kaspiWarning : null}
                offers={can(staff, "chats.send") && canWork(staff, deal.assigneeId) ? offers : null}
                mentionables={mentionables}
                ai={ai && can(staff, "chats.send") && canWork(staff, deal.assigneeId)}
                invoice={invoicePerms.send ? { dealId: deal.id } : null}
                timeZone={storeTimeZone()}
                me={staff.user.id}
              />
            </Panel>
          ) : null}

          {callRows.length ? (
            <div className="max-xl:order-9">
              <DealCalls calls={screen.calls} canListen={can(staff, "calls.recordings")} />
            </div>
          ) : null}

          <Panel title="История" className="max-xl:order-10">
            {canEdit ? <NotesTimeline notes={notes} clientId={deal.clientId} dealId={deal.id} mentionables={mentionables} whatsappTo={whatsappTo} /> : <NotesTimelineReadonly notes={notes} whatsappTo={whatsappTo} />}
          </Panel>
        </div>
      </div>
    </div>
  );
}
