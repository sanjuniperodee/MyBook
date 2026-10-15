import { container } from "@/server/container";
import { listFields } from "@/modules/workspace";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can, canAssignOthers, canSeeAssigned, contactView, requireStaff } from "@/server/access";
import { staffOptions } from "@/modules/access/ui";
import { staffLabel } from "@/shared/domain/staff";
import { dealSourceLabels } from "@/shared/domain/dealSources";
import { channelLabel } from "@/modules/messaging";
import { mentionableStaff } from "@/modules/workspace";
import { formatPhone } from "@/shared/domain/phone";
import { storeTimeZone } from "@/shared/domain/time";
import { NotesTimeline, TaskList } from "@/components/admin/CrmWidgets";
import { dealScreen } from "@/modules/reporting/ui/deal-screen";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { ContactActions } from "@/components/admin/ContactActions";
import { formatDate } from "@/lib/dates";
import { DealAi } from "./DealAi";
import { PaymentsPanel } from "./PaymentsPanel";
import { DealAssignee, DealDelete, DealFields, PipelineSwitch, StageBar, UnsortedBanner } from "./DealControls";
import { DealBooks, DealCalls, DealLinks, Duplicates, NotesTimelineReadonly } from "./sections";
import { pageId } from "@/server/input";

export const metadata = { title: "Сделка" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("deals.view");
  const id = pageId((await params).id);
  const deal = await container().reporting.dealById(id);
  if (!deal || !canSeeAssigned(staff, deal.assigneeId)) notFound();

  const [allStages, pipelines, admins, { noteRows, taskRows, callRows, convs, client, order, bookRows }] = await Promise.all([
    container().sales.queries.listStages(),
    container().sales.queries.listPipelines(),
    container().access.queries.allStaff(),
    container().reporting.dealCard(deal, { calls: can(staff, "calls.view"), chats: can(staff, "chats.view") }),
  ]);
  const conv = convs[0] ?? null;
  const [paymentRows, receiptRows] = await Promise.all([container().sales.payments.list(deal.id), container().sales.receipts.list(deal.id)]);
  const [duplicates, suggestedClientId, dealFields] = await Promise.all([
    container().sales.queries.duplicates(deal),
    !deal.clientId && deal.contactPhone ? container().sales.deals.findClientByPhone(deal.contactPhone) : null,
    listFields("deal"),
  ]);
  const suggested = suggestedClientId ? await container().reporting.clientBrief(suggestedClientId) : null;
  const clientSeen = client?.lastSeenAt ?? null;
  const chat = container().messaging.view;
  const [messages, templates, vars, blocker, offers] = conv
    ? await Promise.all([chat.messages(conv.id), chat.templates(), chat.vars(conv, staffLabel(staff.user)), chat.sendBlocker(conv), container().marketing.service.chatOffers(conv.clientId, can(staff, "promo.give"))])
    : [[], [], null, null, null];
  const ai = await container().assistant.service.configured();
  const mentionables = (await mentionableStaff()).filter((m) => m.id !== staff.user.id).map((m) => m.label);

  const canEdit = can(staff, "deals.edit");
  const contact = contactView(staff, { phone: deal.contactPhone ? formatPhone(deal.contactPhone) : client?.phone, email: deal.contactEmail ?? client?.email });
  const screen = dealScreen({ deal, stages: allStages, staff: admins, tasks: taskRows, notes: noteRows, payments: paymentRows, receipts: receiptRows, calls: callRows, now: new Date() });
  const { pipelineId, stages, stage, tasks, notes } = screen;
  const options = canAssignOthers(staff) ? staffOptions(admins) : staffOptions(admins).filter((a) => a.id === staff.user.id || a.id === deal.assigneeId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/deals" className="text-sm text-muted hover:text-ink">
          ← Сделки
        </Link>
        <span className="text-sm text-muted">
          создана {formatDate(deal.createdAt, true)} · {dealSourceLabels[deal.source]}
        </span>
        {can(staff, "deals.delete") ? (
          <div className="ml-auto">
            <DealDelete id={deal.id} number={deal.number} />
          </div>
        ) : null}
      </div>
      <div>
        <h1 className="text-2xl font-semibold">
          <span className="text-muted">№{deal.number}</span> {deal.title}
        </h1>
        {stage?.kind === "lost" && deal.lostReason ? <p className="mt-1 text-sm text-red-700">Отказ: {deal.lostReason}</p> : null}
      </div>
      {deal.unsorted ? <UnsortedBanner dealId={deal.id} canEdit={canEdit} /> : null}
      {duplicates.length ? <Duplicates dealId={deal.id} duplicates={duplicates} canMerge={(assigneeId) => can(staff, "deals.edit", "deals.delete") && canSeeAssigned(staff, assigneeId)} /> : null}
      {pipelines.length > 1 ? <PipelineSwitch dealId={deal.id} value={pipelineId ?? ""} pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))} disabled={!canEdit} /> : null}
      <StageBar dealId={deal.id} current={deal.stageId} stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))} disabled={!canEdit} />

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
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
              fields={dealFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))}
              values={deal.customFields}
              disabled={!canEdit}
            />
            <div>
              <div className="mb-1 text-xs text-muted">Ответственный</div>
              <DealAssignee dealId={deal.id} value={deal.assigneeId} options={options} disabled={!canEdit} />
            </div>
            <ContactActions target={{ dealId: deal.id }} canCall={can(staff, "calls.make")} canChat={can(staff, "chats.send") && !conv} canEmail={can(staff, "chats.send") && !!(deal.contactEmail || client?.email)} />
          </section>
          <PaymentsPanel
            dealId={deal.id}
            agreed={deal.amount}
            plan={await container().sales.agreedPlan.get(deal.id)}
            canEdit={canEdit}
            order={order ? { id: order.id, number: order.number } : null}
            payments={screen.payments}
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
        </aside>

        <div className="min-w-0 space-y-5">
          {ai ? <DealAi dealId={deal.id} summary={deal.aiSummary ?? null} summaryAt={deal.aiSummary ? formatDate(new Date(deal.aiSummary.at), true) : null} canEdit={canEdit} /> : null}
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-2 font-semibold">Задачи</h2>
            <TaskList tasks={tasks} admins={options} dealId={deal.id} clientId={deal.clientId ?? undefined} emptyText="Нет задач — запланируйте следующий шаг, чтобы сделка не потерялась" />
          </section>

          {conv && vars ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <h2 className="font-semibold">Переписка · {channelLabel(conv.channel)}</h2>
                <Link href={`/admin/chats?c=${conv.id}`} className="text-xs text-wine hover:underline">
                  Открыть в чатах
                </Link>
              </div>
              <ChatPanel className="h-[460px]" conversationId={conv.id} messages={messages} canSend={can(staff, "chats.send")} templates={templates} vars={vars} sendDisabledReason={blocker} offers={can(staff, "chats.send") ? offers : null} mentionables={mentionables} ai={ai && can(staff, "chats.send")} timeZone={storeTimeZone()} />
            </section>
          ) : null}

          {callRows.length ? <DealCalls calls={screen.calls} canListen={can(staff, "calls.recordings")} /> : null}

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">История</h2>
            {canEdit ? <NotesTimeline notes={notes} clientId={deal.clientId} dealId={deal.id} mentionables={mentionables} /> : <NotesTimelineReadonly notes={notes} />}
          </section>
        </div>
      </div>
    </div>
  );
}
