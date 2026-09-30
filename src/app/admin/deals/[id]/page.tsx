import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { ExternalLink, Package, PhoneIncoming, PhoneMissed, PhoneOutgoing, UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { crmCalls, crmConversations, crmDeals, crmNotes, crmTasks, orders, users } from "@/lib/db/schema";
import { can, canAssignOthers, canSeeAssigned, contactView, requireStaff } from "@/lib/crm/rbac";
import { adminLabel, listAdmins, staffOptions } from "@/lib/crm";
import { dealSourceLabels, listStages } from "@/lib/crm/deals";
import { channelLabel } from "@/lib/crm/chats";
import { chatVars, listTemplates, loadChatMessages, sendBlocker } from "@/lib/crm/chat-view";
import { formatPhone } from "@/lib/crm/phone";
import { formatPrice } from "@/config/site";
import { orderStatusColors, orderStatusLabel } from "@/lib/orders-shared";
import { NotesTimeline, TaskList, type NoteItem, type TaskItem } from "@/components/admin/CrmWidgets";
import { ChatPanel } from "@/components/admin/ChatPanel";
import { ContactActions } from "@/components/admin/ContactActions";
import { cn, formatDate } from "@/lib/utils";
import { DealAssignee, DealDelete, DealFields, StageBar } from "./DealControls";

export const metadata = { title: "Сделка" };

const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("deals.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const deal = await db.query.crmDeals.findFirst({ where: eq(crmDeals.id, id) });
  if (!deal || !canSeeAssigned(staff, deal.assigneeId)) notFound();

  const [stages, admins, noteRows, taskRows, callRows, convs, client, order] = await Promise.all([
    listStages(),
    listAdmins(),
    db.select().from(crmNotes).where(eq(crmNotes.dealId, deal.id)).orderBy(desc(crmNotes.createdAt)).limit(100),
    db.select().from(crmTasks).where(eq(crmTasks.dealId, deal.id)).orderBy(sql`${crmTasks.doneAt} nulls first`, asc(crmTasks.dueAt)),
    can(staff, "calls.view") ? db.select().from(crmCalls).where(eq(crmCalls.dealId, deal.id)).orderBy(desc(crmCalls.startedAt)).limit(30) : Promise.resolve([]),
    can(staff, "chats.view") ? db.select().from(crmConversations).where(eq(crmConversations.dealId, deal.id)).orderBy(desc(crmConversations.lastMessageAt)) : Promise.resolve([]),
    deal.clientId ? db.query.users.findFirst({ where: eq(users.id, deal.clientId), columns: { id: true, name: true, email: true, phone: true } }) : null,
    deal.orderId ? db.query.orders.findFirst({ where: eq(orders.id, deal.orderId), columns: { id: true, number: true, status: true, amount: true } }) : null,
  ]);
  const names = new Map(admins.map((a) => [a.id, adminLabel(a)]));
  const conv = convs[0] ?? null;
  const [messages, templates, vars, blocker] = conv ? await Promise.all([loadChatMessages(conv.id), listTemplates(), chatVars(conv, adminLabel(staff.user)), sendBlocker(conv)]) : [[], [], null, null];

  const canEdit = can(staff, "deals.edit");
  const contact = contactView(staff, { phone: deal.contactPhone ? formatPhone(deal.contactPhone) : client?.phone, email: deal.contactEmail ?? client?.email });
  const stage = stages.find((s) => s.id === deal.stageId);
  const now = new Date();
  const tasks: TaskItem[] = taskRows.map((t) => ({
    id: t.id,
    kind: t.kind,
    title: t.title,
    dueLabel: t.dueAt ? `до ${formatDate(t.dueAt, true)}` : null,
    overdue: !!t.dueAt && t.dueAt < now,
    done: !!t.doneAt,
    assignee: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null,
  }));
  const notes: NoteItem[] = noteRows.map((n) => ({
    id: n.id,
    kind: n.kind,
    text: n.text,
    author: n.authorId ? (names.get(n.authorId) ?? "—") : "система",
    dateLabel: formatDate(n.createdAt, true),
  }));
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
      <StageBar dealId={deal.id} current={deal.stageId} stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))} disabled={!canEdit} />

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
            <DealFields
              deal={{ id: deal.id, title: deal.title, amount: deal.amount, source: deal.source, contactName: deal.contactName, contactPhone: contact.masked ? "" : (deal.contactPhone ?? ""), contactEmail: contact.masked ? "" : (deal.contactEmail ?? ""), tags: deal.tags }}
              masked={contact.masked ? { phone: contact.phone, email: contact.email } : null}
              disabled={!canEdit}
            />
            <div>
              <div className="mb-1 text-xs text-muted">Ответственный</div>
              <DealAssignee dealId={deal.id} value={deal.assigneeId} options={options} disabled={!canEdit} />
            </div>
            <ContactActions target={{ dealId: deal.id }} canCall={can(staff, "calls.make")} canChat={can(staff, "chats.send") && !conv} />
          </section>
          <section className="space-y-2 rounded-2xl border border-line bg-white p-5 text-sm">
            <h2 className="mb-1 font-semibold">Связи</h2>
            {client && can(staff, "clients.view") ? (
              <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-2 hover:text-wine">
                <UserRound className="size-4 text-muted" /> {client.name || contactView(staff, { email: client.email }).email}
                <ExternalLink className="ml-auto size-3.5 text-muted" />
              </Link>
            ) : (
              <p className="text-muted">Клиент ещё не зарегистрирован на сайте — свяжем автоматически по телефону, когда он оформит заказ.</p>
            )}
            {order && can(staff, "orders.view") ? (
              <Link href={`/admin/orders/${order.id}`} className="flex items-center gap-2 hover:text-wine">
                <Package className="size-4 text-muted" /> Заказ №{order.number} · {formatPrice(order.amount)}
                <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px]", orderStatusColors[order.status])}>{orderStatusLabel(order.status)}</span>
              </Link>
            ) : null}
            {convs.map((c) => (
              <Link key={c.id} href={`/admin/chats?c=${c.id}`} className="flex items-center gap-2 text-muted hover:text-wine">
                💬 {channelLabel(c.channel)} {c.unread ? <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] text-white">{c.unread}</span> : null}
              </Link>
            ))}
          </section>
        </aside>

        <div className="min-w-0 space-y-5">
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
              <ChatPanel className="h-[460px]" conversationId={conv.id} messages={messages} canSend={can(staff, "chats.send")} templates={templates} vars={vars} sendDisabledReason={blocker} />
            </section>
          ) : null}

          {callRows.length ? (
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-3 font-semibold">Звонки</h2>
              <ul className="divide-y divide-line text-sm">
                {callRows.map((c) => {
                  const Icon = c.direction === "out" ? PhoneOutgoing : c.status === "missed" ? PhoneMissed : PhoneIncoming;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Icon className={cn("size-4", c.status === "missed" ? "text-red-600" : "text-muted")} />
                      <span className="w-32 text-muted">{formatDate(c.startedAt, true)}</span>
                      <span className="flex-1">
                        {c.direction === "out" ? "Исходящий" : c.status === "missed" ? "Пропущенный" : "Входящий"}
                        {c.durationSec ? ` · ${dur(c.durationSec)}` : ""}
                        {c.staffId ? <span className="text-muted"> · {names.get(c.staffId)}</span> : null}
                      </span>
                      {c.hasRecording && can(staff, "calls.recordings") ? <audio controls preload="none" src={`/api/admin/calls/${c.id}/recording`} className="h-8 w-56" /> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">История</h2>
            {canEdit ? <NotesTimeline notes={notes} clientId={deal.clientId} dealId={deal.id} /> : <NotesTimelineReadonly notes={notes} />}
          </section>
        </div>
      </div>
    </div>
  );
}

function NotesTimelineReadonly({ notes }: { notes: NoteItem[] }) {
  return (
    <ol className="space-y-3 text-sm">
      {notes.map((n) => (
        <li key={n.id}>
          <div className="text-xs text-muted">
            {n.author} · {n.dateLabel}
          </div>
          <p className="whitespace-pre-line">{n.text}</p>
        </li>
      ))}
      {notes.length === 0 ? <p className="text-muted">Записей нет.</p> : null}
    </ol>
  );
}
