import { container } from "@/server/container";
import { listFields } from "@/modules/workspace";
import Link from "next/link";
import { cn } from "@/lib/class-names";
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
import { CreateClientFromDeal, DealAssignee, DealDelete, DealFields, PipelineSwitch, StageBar, UnsortedBanner } from "./DealControls";
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/deals" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
          ← Сделки
        </Link>
        <span className="text-sm text-muted max-lg:hidden">
          создана {formatDate(deal.createdAt, true)} · {dealSourceLabels[deal.source]}
        </span>
        {can(staff, "deals.delete") ? (
          <div className="ml-auto">
            <DealDelete id={deal.id} number={deal.number} />
          </div>
        ) : null}
      </div>
      <div>
        <h1 className="text-2xl font-semibold break-words">
          <span className="text-muted">№{deal.number}</span> {deal.title}
        </h1>
        <p className="mt-1 text-sm text-muted lg:hidden">
          создана {formatDate(deal.createdAt, true)} · {dealSourceLabels[deal.source]}
        </p>
        {stage?.kind === "lost" && deal.lostReason ? <p className="mt-1 text-sm text-red-700">Отказ: {deal.lostReason}</p> : null}
      </div>
      {deal.unsorted ? <UnsortedBanner dealId={deal.id} canEdit={canEdit && canWork(staff, deal.assigneeId)} canDecide={can(staff, "deals.delete")} request={deal.tags.includes(REJECTION_TAGS.spam) ? "spam" : deal.tags.includes(REJECTION_TAGS.reject) ? "reject" : null} /> : null}
      {openDeals.length ? <Duplicates dealId={deal.id} closed={closed} duplicates={openDeals} /> : null}
      {pipelines.length > 1 ? <PipelineSwitch dealId={deal.id} value={pipelineId ?? ""} pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))} disabled={!canEdit} /> : null}
      <StageBar dealId={deal.id} current={deal.stageId} stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))} disabled={!canEdit} />

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4 max-lg:order-2">
          <section className="space-y-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
            <DealFields
              deal={{
                id: deal.id,
                title: deal.title,
                amount: deal.amount,
                source: deal.source,
                contactName: deal.contactName,
                contactPhone: contact.masked ? "" : (deal.contactPhone ?? ""),
                contactEmail: contact.masked ? "" : (deal.contactEmail ?? ""),
                extraPhones: contact.masked ? [] : deal.extraPhones.map((p) => formatPhone(p)),
                tags: deal.tags,
              }}
              masked={contact.masked ? { phone: contact.phone, email: contact.email } : null}
              canReveal={can(staff, "clients.reveal") && canWork(staff, deal.assigneeId)}
              fields={dealFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))}
              values={deal.customFields}
              disabled={!canEdit}
              pricing={deal.orderId ? null : { plan: agreedPlan, maxPercent: maxDiscount }}
            />
            <div>
              <div className="mb-1 text-xs text-muted">Ответственный</div>
              <DealAssignee dealId={deal.id} value={deal.assigneeId} options={options} disabled={!canEdit} />
            </div>
            <ContactActions target={{ dealId: deal.id }} canCall={can(staff, "calls.make")} canChat={can(staff, "chats.send") && !conv} canEmail={can(staff, "chats.send") && !!(deal.contactEmail || client?.email)} />
            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span title="Клиент просил не писать: бот не напоминает о себе, правила автоматизаций не пишут. На его сообщения отвечать можно.">Писать первым</span>
              <NoMarketingToggle target={{ dealId: deal.id }} on={noMarketing} disabled={!canEdit || !works} />
            </div>
          </section>
          {batch.length > 1 ? (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm" data-testid="deal-batch">
              <h2 className="text-sm font-semibold text-emerald-950">Пакет: {batch.length} кн. оплачено сразу</h2>
              <p className="mt-1 text-xs text-emerald-900">Клиент оформляет книги по очереди — каждая забирает свою сделку (цена и предоплата делятся поровну).</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {batch.map((b) => (
                  <li key={b.id}>
                    <Link href={`/admin/deals/${b.id}`} className={cn("rounded-full px-2.5 py-1 text-xs", b.id === deal.id ? "bg-wine text-white" : "bg-white text-ink-soft hover:bg-cream")}>
                      {b.index + 1}/{b.size} · №{b.number}{b.hasOrder ? " · заказ оформлен" : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <PaymentsPanel
            dealId={deal.id}
            agreed={deal.amount}
            plan={agreedPlan}
            gifts={await container().sales.agreedGifts.get(deal.id)}
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
          />
          {bookRows.length ? <DealBooks books={bookRows} seen={clientSeen} /> : null}
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
          />
          {duplicates.past.length ? <PastDeals deals={duplicates.past} canSee={(assigneeId) => canSeeAssigned(staff, assigneeId)} /> : null}
          {!deal.clientId && !suggested && deal.contactPhone && can(staff, "clients.create") && canWork(staff, deal.assigneeId) ? <CreateClientFromDeal dealId={deal.id} name={deal.contactName.startsWith("…") ? "" : deal.contactName} /> : null}
        </aside>

        <div className="min-w-0 space-y-5">
          {ai ? <DealAi dealId={deal.id} summary={deal.aiSummary ?? null} summaryAt={deal.aiSummary ? formatDate(new Date(deal.aiSummary.at), true) : null} canEdit={canEdit} /> : null}
          <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h2 className="mb-2 font-semibold">Задачи</h2>
            <TaskList tasks={tasks} admins={options} dealId={deal.id} clientId={deal.clientId ?? undefined} emptyText="Нет задач — запланируйте следующий шаг, чтобы сделка не потерялась" />
          </section>

          {conv && vars ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
                <h2 className="font-semibold">Переписка · {channelLabel(conv.channel)}</h2>
                <Link href={`/admin/chats?c=${conv.id}`} className="inline-flex min-h-11 items-center text-sm text-wine hover:underline lg:min-h-0 lg:text-xs">
                  Открыть в чатах
                </Link>
              </div>
              <ChatPanel
                className="h-[70dvh] max-h-[620px] lg:h-[460px] lg:max-h-none"
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
            </section>
          ) : null}

          {callRows.length ? <DealCalls calls={screen.calls} canListen={can(staff, "calls.recordings")} /> : null}

          <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h2 className="mb-4 font-semibold">История</h2>
            {canEdit ? <NotesTimeline notes={notes} clientId={deal.clientId} dealId={deal.id} mentionables={mentionables} whatsappTo={whatsappTo} /> : <NotesTimelineReadonly notes={notes} whatsappTo={whatsappTo} />}
          </section>
        </div>
      </div>
    </div>
  );
}
