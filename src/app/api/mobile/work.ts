import "server-only";
import { container } from "@/server/container";
import { canSeeAssigned, canSeeClientRecords, can, canWork, contactView, staffViewer, type Staff } from "@/server/access";
import { HttpError } from "@/server/api";
import { currentMonth } from "@/modules/sales";
import { taskContact, taskRow, type Reacher } from "@/app/admin/tasks/task-row";
import { getSetting } from "@/modules/workspace";
import { staffLabel } from "@/shared/domain/staff";
import { formatPhone } from "@/shared/domain/phone";
import { channelLabel } from "@/modules/messaging";
import { responseWait, slaMinutes } from "@/modules/reporting/ui/response-wait";
import { parseWorkHours } from "@/shared/domain/schedule";

/**
 * Рабочий стол и справочники для мобильного приложения: «Мой день», задачи, клиенты, звонки, сотрудники — те же выборки
 * и правила видимости, что у экранов CRM, в виде JSON.
 */

type ListedTask = Awaited<ReturnType<ReturnType<typeof container>["reporting"]["taskList"]>>[number];

/** Задача с подписью того, к чему она (сделка, заказ, клиент): приложение открывает нужный экран и звонит/пишет по ней. */
export function taskJson(r: ListedTask, staff: Staff, now: Date) {
  const t = r.task;
  // Подписи, просрочка и права — те же, что у строки задачи в CRM.
  const row = taskRow(r, { userId: staff.user.id, allTasks: can(staff, "tasks.all") }, now);
  const context = t.dealId ? { type: "deal" as const, id: t.dealId, label: row.context?.label ?? "" } : t.orderId ? { type: "order" as const, id: t.orderId, label: row.context?.label ?? "" } : t.clientId ? { type: "client" as const, id: t.clientId, label: row.context?.label ?? "" } : null;
  return {
    id: t.id,
    title: row.title,
    kind: t.kind,
    dueAt: t.dueAt?.toISOString() ?? null,
    overdue: row.overdue && !t.doneAt,
    done: row.done,
    remindBeforeMin: t.remindBeforeMin,
    fromBot: row.fromBot,
    assigneeId: t.assigneeId,
    editable: row.editable,
    context,
    // Цель для «Позвонить» и «Написать»: номер на сервере берётся по сделке, заказу или клиенту (даже если сотруднику он скрыт).
    target: { dealId: t.dealId, orderId: t.orderId, clientId: t.clientId },
  };
}

export async function mobileTasks(staff: Staff, opts: { done: boolean; who?: string; kind?: string; q?: string }) {
  const rows = await container().reporting.taskList(staffViewer(staff), { who: opts.who && staff.scope === "all" ? opts.who : "mine", done: opts.done, kind: opts.kind ?? null, q: opts.q ?? null });
  const now = new Date();
  return rows.map((r) => taskJson(r, staff, now));
}

/** «Мой день»: числа на плитках, план месяца и первые строки списков (задачи, ждут ответа, пропущенные звонки). */
export async function mobileToday(staff: Staff) {
  const me = staff.user.id;
  const sections = { chats: can(staff, "chats.view"), calls: can(staff, "calls.view"), deals: can(staff, "deals.view") };
  const [day, plans, slaRaw, hoursRaw, provider] = await Promise.all([
    container().reporting.myDay(staffViewer(staff), sections),
    container().sales.queries.planProgress(currentMonth(), [me]),
    getSetting("crm.slaMinutes"),
    getSetting("crm.workHours"),
    can(staff, "calls.make") ? container().telephony.phone.currentProvider() : null,
  ]);
  const now = new Date();
  // Кому можно позвонить через АТС и открыть чат по задаче: только если сделку (заказ, клиента) ведёт этот сотрудник.
  const reacher: Reacher = { phoneVisible: can(staff, "clients.contacts"), works: (assigneeId) => canWork(staff, assigneeId), pbx: provider === "zadarma" && !!staff.user.sipExtension, chat: can(staff, "chats.send") };
  const sla = slaMinutes(slaRaw);
  const hours = parseWorkHours(hoursRaw);
  const plan = plans.get(me);
  return {
    counts: { tasks: day.counts.tasks, overdueTasks: day.counts.overdueTasks, waiting: day.counts.waiting, missed: day.counts.missed, unsorted: day.unsorted.n, openDeals: day.deals.n, openDealsSum: day.deals.sum, noNextStep: day.deals.noNextStep },
    plan: plan?.planAmount ? { planAmount: plan.planAmount, factAmount: plan.factAmount, planDeals: plan.planDeals, factDeals: plan.factDeals } : null,
    tasks: day.tasks.map((r) => ({ ...taskJson(r as unknown as ListedTask, staff, now), contact: taskContact(r, reacher) })),
    waiting: day.waiting.map((c) => {
      const w = c.awaitingSince ? responseWait(c.awaitingSince, now, hours, sla) : null;
      return { id: c.id, title: c.contactName || contactView(staff, { phone: formatPhone(c.chatId) }).phone || c.chatId, channel: c.channel, channelLabel: channelLabel(c.channel), preview: c.lastMessageText, waitLabel: w?.label ?? null, overdue: !!w?.overdue };
    }),
    missed: day.missed.map((c) => ({ id: c.id, phone: contactView(staff, { phone: formatPhone(c.clientPhone) }).phone || null, at: c.startedAt.toISOString(), dealId: c.dealId, clientId: c.clientId })),
  };
}

export async function mobileCalls(staff: Staff, filter: "all" | "missed" | "in" | "out" | "mine", days = 14) {
  const { rows, stats } = await container().reporting.callJournal(staffViewer(staff), filter, days);
  return {
    stats,
    calls: rows.map(({ call, clientName, dealTitle, dealContact }) => ({
      id: call.id,
      direction: call.direction,
      status: call.status,
      at: call.startedAt.toISOString(),
      durationSec: call.durationSec,
      phone: contactView(staff, { phone: formatPhone(call.clientPhone) }).phone || null,
      name: clientName || dealContact || dealTitle || null,
      handled: !!call.handledAt,
      dealId: call.dealId,
      clientId: call.clientId,
    })),
  };
}

/** Клиенты: поиск, сортировка; роль «только свои» — своих и неразобранных. */
export async function mobileClients(staff: Staff, opts: { q?: string; sort?: "new" | "ltv" | "active"; page: number; mine: boolean }) {
  const PAGE = 40;
  const scope = staff.scope === "own" ? staff.user.id : null;
  const { rows, total } = await container().reporting.clients({ segment: "all", q: opts.q, sort: opts.sort ?? "new", limit: PAGE, offset: (opts.page - 1) * PAGE, scopeManagerId: scope ?? (opts.mine ? staff.user.id : null), onlyMine: opts.mine });
  return {
    total,
    page: opts.page,
    pageSize: PAGE,
    clients: rows.map((r) => {
      const c = contactView(staff, { phone: r.user.phone ?? "", email: r.user.email });
      return { id: r.user.id, name: r.user.name || r.user.email.split("@")[0], phone: c.phone ? formatPhone(c.phone) : null, ltv: r.ltv, orders: r.ordersCount, books: r.booksCount, lastSeenAt: r.user.lastSeenAt?.toISOString() ?? null, createdAt: r.user.createdAt.toISOString(), tags: r.user.tags };
    }),
  };
}

export async function mobileClient(staff: Staff, id: string) {
  const c = container();
  const client = await c.reporting.clientById(id);
  if (!client || !canSeeAssigned(staff, client.managerId)) throw new HttpError(404, "notFound");
  const [card, admins] = await Promise.all([c.reporting.clientCard(id, { deals: can(staff, "deals.view") }), c.access.queries.allStaff()]);
  const own = canSeeClientRecords(staff, client.managerId);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const contact = contactView(staff, { phone: client.phone ?? "", email: client.email });
  return {
    id: client.id,
    name: client.name || client.email.split("@")[0],
    phone: contact.phone ? formatPhone(contact.phone) : null,
    email: contact.email || null,
    tags: client.tags,
    manager: client.managerId ? (names.get(client.managerId) ?? null) : null,
    lastSeenAt: client.lastSeenAt?.toISOString() ?? null,
    createdAt: client.createdAt.toISOString(),
    money: card.money,
    canWrite: canWork(staff, client.managerId),
    books: own ? card.bookRows.map((b) => ({ id: b.book.id, title: b.book.title, theme: b.book.theme, status: b.book.status, answered: b.answered, total: b.total, words: b.words, photos: b.photos })) : [],
    orders: own ? card.orderRows.slice(0, 20).map((o) => ({ id: o.id, number: o.number, status: o.status, amount: o.amount, plan: o.plan, createdAt: o.createdAt.toISOString() })) : [],
    deals: card.dealRows.map(({ deal, stage }) => ({ id: deal.id, number: deal.number, title: deal.title, amount: deal.amount, stage: { name: stage.name, color: stage.color, kind: stage.kind } })),
    tasks: card.taskRows.filter((t) => !t.doneAt).map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null })),
    notes: card.noteRows.slice(0, 10).map((n) => ({ id: n.id, text: n.text, at: n.createdAt.toISOString(), author: n.authorId ? (names.get(n.authorId) ?? null) : null })),
  };
}

/** Сотрудники для выбора ответственного (передать диалог, назначить сделку или задачу). */
export async function mobileStaff(staff: Staff) {
  const list = await container().access.queries.activeStaffList();
  const all = list.map((u) => ({ id: u.id, name: staffLabel(u) }));
  return { canAssignOthers: staff.context.canAssignOthers, staff: staff.context.canAssignOthers ? all : all.filter((u) => u.id === staff.user.id) };
}
