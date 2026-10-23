import "server-only";
import { container } from "@/server/container";
import { can, canSeeAssigned, canWork, contactView, type Staff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { formatPhone } from "@/shared/domain/phone";
import { formatPrice } from "@/config/site";
import { orderStatusLabels } from "@/modules/ordering/ui/status";
import { dealSourceLabels } from "@/shared/domain/dealSources";
import { taskContact, taskRow, type ListedTask, type Reacher } from "./task-row";

/**
 * Карточка задачи: сама задача и всё, к чему она привязана, — сделка (этап, сумма, кто ведёт), клиент, заказ, диалог,
 * последние записи в ленте и другие открытые задачи по сделке. Видимость — как у списка задач (свои и ничьи; «все записи»
 * видят любые); сделку и заказ показываем, только если они сотруднику видны. Общая для страницы CRM и мобильного API.
 */
export async function loadTaskDetail(staff: Staff, id: string) {
  const r = await container().reporting.taskById(id);
  if (!r) return null;
  const t = r.task;
  const seesAll = staff.scope === "all";
  if (!seesAll && t.assigneeId && t.assigneeId !== staff.user.id) return null;
  const c = container();
  const [deal, admins, provider] = await Promise.all([t.dealId ? c.reporting.dealById(t.dealId) : null, c.access.queries.allStaff(), can(staff, "calls.make") ? c.telephony.phone.currentProvider() : null]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const dealVisible = !!deal && can(staff, "deals.view") && canSeeAssigned(staff, deal.assigneeId);
  const card = dealVisible ? await c.reporting.dealCard(deal!, { calls: false, chats: can(staff, "chats.view") }) : null;
  const stage = dealVisible ? ((await c.sales.queries.listStages()).find((x) => x.id === deal!.stageId) ?? null) : null;
  const clientId = t.clientId ?? deal?.clientId ?? null;
  const client = clientId && can(staff, "clients.view") ? await c.reporting.clientBrief(clientId) : null;
  const now = new Date();
  const reacher: Reacher = { phoneVisible: can(staff, "clients.contacts"), works: (assigneeId) => canWork(staff, assigneeId), pbx: provider === "zadarma" && !!staff.user.sipExtension, chat: can(staff, "chats.send") };
  const row = { ...taskRow(r as unknown as ListedTask, { userId: staff.user.id, allTasks: can(staff, "tasks.all") }, now), contact: taskContact(r, reacher) };
  const phone = deal?.contactPhone ?? client?.phone ?? r.phone ?? null;
  const contact = contactView(staff, { phone: phone ? formatPhone(phone) : null, email: deal?.contactEmail ?? client?.email ?? null });
  const conv = card?.convs[0] ?? null;
  return {
    raw: r,
    row,
    task: { id: t.id, title: row.title, kind: t.kind, dueAt: t.dueAt, doneAt: t.doneAt, result: t.result ?? "", assigneeId: t.assigneeId, assignee: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null, createdBy: t.createdById ? (names.get(t.createdById) ?? null) : null, fromBot: row.fromBot, overdue: row.overdue && !t.doneAt, editable: row.editable },
    deal: dealVisible
      ? {
          id: deal!.id,
          number: deal!.number,
          title: deal!.title,
          stage: stage ? { name: stage.name, color: stage.color, kind: stage.kind } : null,
          amount: deal!.amount,
          amountLabel: deal!.amount ? formatPrice(deal!.amount) : null,
          source: dealSourceLabels[deal!.source],
          assignee: deal!.assigneeId ? (names.get(deal!.assigneeId) ?? null) : null,
          unsorted: deal!.unsorted,
          contactName: deal!.contactName,
        }
      : null,
    client: client ? { id: client.id, name: client.name, email: contact.email || null, phone: contact.phone || null, masked: contact.masked } : null,
    contact: { name: deal?.contactName || client?.name || r.clientName || null, phone: contact.phone || null, email: contact.email || null, masked: contact.masked },
    order: card?.order ? { id: card.order.id, number: card.order.number, status: card.order.status, statusLabel: orderStatusLabels[card.order.status as keyof typeof orderStatusLabels] ?? card.order.status, amountLabel: formatPrice(card.order.amount) } : r.orderNumber && t.orderId && can(staff, "orders.view") ? { id: t.orderId, number: r.orderNumber, status: "", statusLabel: "", amountLabel: "" } : null,
    chat: conv ? { id: conv.id, preview: conv.lastMessageText, unread: conv.unread } : null,
    notes: (card?.noteRows ?? []).slice(0, 6).map((n) => ({ id: n.id, kind: n.kind, text: n.text, author: n.authorId ? (names.get(n.authorId) ?? "—") : "—", at: n.createdAt })),
    others: (card?.taskRows ?? []).filter((x) => x.id !== t.id && !x.doneAt).slice(0, 5).map((x) => ({ id: x.id, title: x.title, dueAt: x.dueAt, overdue: !!x.dueAt && x.dueAt < now })),
    staff: admins.map((a) => ({ id: a.id, label: staffLabel(a) })),
    canAssign: seesAll,
  };
}
