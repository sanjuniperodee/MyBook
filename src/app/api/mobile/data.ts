import "server-only";
import { admin } from "@/i18n/admin";
import { container } from "@/server/container";
import { assertVisible, can, canWork, contactView, staffViewer, type Staff } from "@/server/access";
import { HttpError } from "@/server/api";
import { discountLimit } from "@/server/discount";
import { invoiceViews } from "@/app/admin/invoices/view";
import { getSetting, listFields } from "@/modules/workspace";
import { channelLabel } from "@/modules/messaging";
import { responseWait, slaMinutes } from "@/modules/reporting/ui/response-wait";
import { parseWorkHours } from "@/shared/domain/schedule";
import { fillTemplate } from "@/shared/domain/templates";
import { formatPhone } from "@/shared/domain/phone";
import { staffLabel } from "@/shared/domain/staff";
import { channelLabel as acquisitionChannel, toAttribution } from "@/shared/domain/channels";
import { dealSourceLabels } from "@/shared/domain/dealSources";
import { nowMs } from "@/lib/dates";

/**
 * Данные для мобильного приложения продажника: те же выборки и правила видимости, что у страниц «Чаты» и «Сделки»,
 * но в виде JSON. Права проверяет вызывающий роут (apiStaff) и эти функции (чужой диалог роли «только свои» — 403).
 */

export const CHAT_FILTERS = ["open", "mine", "unread", "waiting", "closed"] as const;
export type ChatFilterId = (typeof CHAT_FILTERS)[number];

type Conv = NonNullable<Awaited<ReturnType<ReturnType<typeof container>["messaging"]["queries"]["conversation"]>>>;

/** Заголовок диалога: имя, а без него номер или почта — с учётом права видеть контакты. */
function convTitle(staff: Staff, c: Pick<Conv, "contactName" | "chatId" | "channel" | "meta">) {
  if (c.contactName) return c.contactName;
  if (c.channel === "email") return contactView(staff, { email: c.chatId }).email;
  if (c.channel === "site") return c.meta.phone ? contactView(staff, { phone: formatPhone(c.meta.phone) }).phone : admin.mobileSiteVisitor;
  return contactView(staff, { phone: formatPhone(c.chatId) }).phone || c.chatId;
}

/** Список диалогов под фильтр и поиск — строки для экрана «Чаты». */
export async function mobileChatList(staff: Staff, filter: ChatFilterId, q?: string) {
  const [list, admins, slaRaw, hoursRaw] = await Promise.all([
    container().reporting.inbox(staffViewer(staff), filter, q?.trim() || undefined),
    container().access.queries.allStaff(),
    getSetting("crm.slaMinutes"),
    getSetting("crm.workHours"),
  ]);
  const sla = slaMinutes(slaRaw);
  const hours = parseWorkHours(hoursRaw);
  const now = new Date();
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  return list.map((c) => {
    const wait = c.awaitingSince ? responseWait(c.awaitingSince, now, hours, sla) : null;
    const phase = (c.botState as { phase?: string } | null)?.phase;
    return {
      id: c.id,
      title: convTitle(staff, c),
      channel: c.channel,
      channelLabel: channelLabel(c.channel),
      avatarUrl: c.avatarUrl,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      preview: c.lastMessageText,
      unread: c.unread,
      status: c.status,
      assignee: c.assigneeId ? (names.get(c.assigneeId) ?? null) : null,
      assigneeId: c.assigneeId,
      waitLabel: wait?.label ?? null,
      overdue: !!wait?.overdue,
      bot: phase === "active" || phase === "waiting",
      pinned: !!c.pinnedAt,
    };
  });
}

/** Файл сообщения: вложения шлюза — по id сообщения (с проверкой прав), остальное — как есть. */
const mediaPath = (m: { id: string; gateway?: boolean; mediaUrl: string | null }) => (m.gateway ? `/api/admin/chats/messages/${m.id}/media` : m.mediaUrl);

/** Диалог целиком: шапка, сообщения, права на ответ и счёт, шаблоны (уже с подстановкой), сделка и счета. */
export async function mobileChatDetail(staff: Staff, id: string, limit = 120) {
  const conv = await container().messaging.queries.conversation(id);
  if (!conv) throw new HttpError(404, "notFound");
  assertVisible(staff, conv.assigneeId);
  const c = container();
  const chat = c.messaging.view;
  const [messages, templates, vars, blocker, { dealRow, client }, admins, bot] = await Promise.all([
    chat.messages(conv.id, limit),
    chat.templates(),
    chat.vars(conv, staffLabel(staff.user)),
    chat.sendBlocker(conv),
    c.reporting.conversationContext(conv),
    c.access.queries.allStaff(),
    c.messaging.botStatus(conv.id),
  ]);
  const mine = canWork(staff, conv.assigneeId);
  const canReply = can(staff, "chats.send") && mine;
  const dealWork = !dealRow || canWork(staff, dealRow.deal.assigneeId);
  const invoiceEdit = can(staff, "deals.edit") && mine && dealWork;
  const invoiceSend = canReply && can(staff, "deals.edit") && dealWork;
  const invoiceRows = conv.dealId && can(staff, "deals.view") ? await c.ordering.invoices.listFor(conv.dealId) : [];
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  return {
    conversation: {
      id: conv.id,
      title: convTitle(staff, conv),
      channel: conv.channel,
      channelLabel: channelLabel(conv.channel),
      avatarUrl: conv.avatarUrl,
      status: conv.status,
      unread: conv.unread,
      assigneeId: conv.assigneeId,
      assignee: conv.assigneeId ? (names.get(conv.assigneeId) ?? null) : null,
      dealId: conv.dealId,
      clientId: conv.clientId,
      clientName: client?.name ?? null,
    },
    messages: messages.map((m) => ({ ...m, media: mediaPath(m) })),
    deal: dealRow
      ? {
          id: dealRow.deal.id,
          number: dealRow.deal.number,
          title: dealRow.deal.title,
          amount: dealRow.deal.amount,
          stage: { id: dealRow.stage.id, name: dealRow.stage.name, color: dealRow.stage.color },
          source: acquisitionChannel(toAttribution(dealRow.deal.utm), dealRow.deal.source),
        }
      : null,
    perms: { canReply, canNote: can(staff, "chats.view"), canInvoice: invoiceSend, canEditInvoices: invoiceEdit, canCreateDeal: can(staff, "deals.edit") && mine, mine },
    sendBlocker: blocker,
    bot: { label: bot.label ?? null, canStart: !!bot.canStart },
    // Шаблоны с подстановкой имени, заказа, менеджера и полей сделки — приложение вставляет готовый текст.
    templates: templates.map((t) => ({ id: t.id, title: t.title, text: fillTemplate(t.text, vars) })),
    invoices: invoiceViews(invoiceRows, { now: new Date(), withLink: invoiceEdit }),
  };
}

/** Воронка и сделки для экрана «Сделки»: этапы и карточки (с фильтрами «мои», ответственный, поиск). */
export async function mobileDeals(staff: Staff, sp: Record<string, string | undefined>) {
  const c = container();
  const pipelines = await c.sales.queries.listPipelines();
  const pipeline = pipelines.find((x) => x.id === sp.p) ?? pipelines[0];
  if (!pipeline) return { pipelines: [], pipeline: null, stages: [], deals: [] };
  const selectFields = (await listFields("deal")).filter((f) => f.type === "select");
  const [stages, rows, admins] = await Promise.all([c.sales.queries.listStages(pipeline.id), c.reporting.dealList(staffViewer(staff), pipeline, sp, selectFields, "list"), c.access.queries.allStaff()]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const now = nowMs();
  return {
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name })),
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages: stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, position: s.position })),
    deals: rows.map(({ deal, stageKind, nextTask, unread, paid }) => ({
      id: deal.id,
      number: deal.number,
      title: deal.title,
      contactName: deal.contactName,
      stageId: deal.stageId,
      stageKind,
      amount: deal.amount,
      paid,
      source: deal.utm ? acquisitionChannel(toAttribution(deal.utm), deal.source) : dealSourceLabels[deal.source],
      assigneeId: deal.assigneeId,
      assignee: deal.assigneeId ? (names.get(deal.assigneeId) ?? null) : null,
      unsorted: deal.unsorted,
      unread,
      daysInStage: Math.floor((now - deal.stageChangedAt.getTime()) / 86_400_000),
      nextTask: nextTask ? { at: new Date(nextTask).toISOString(), overdue: new Date(nextTask).getTime() < now } : null,
      createdAt: deal.createdAt.toISOString(),
    })),
  };
}

/** Карточка сделки: данные, этапы для перемещения, задачи, заметки, платежи, счета и чат сделки. */
export async function mobileDealDetail(staff: Staff, id: string) {
  const c = container();
  const deal = await c.reporting.dealById(id);
  if (!deal) throw new HttpError(404, "notFound");
  assertVisible(staff, deal.assigneeId);
  const [stages, admins, card, payments, invoiceRows, maxDiscount] = await Promise.all([
    c.sales.queries.listStages(),
    c.access.queries.allStaff(),
    c.reporting.dealCard(deal, { calls: false, chats: can(staff, "chats.view") }),
    c.sales.payments.list(deal.id),
    c.ordering.invoices.listFor(deal.id),
    discountLimit(staff),
  ]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const stage = stages.find((s) => s.id === deal.stageId);
  const works = canWork(staff, deal.assigneeId);
  const edit = can(staff, "deals.edit") && works;
  const contact = contactView(staff, { phone: deal.contactPhone ?? "", email: "" });
  return {
    id: deal.id,
    number: deal.number,
    title: deal.title,
    contactName: deal.contactName,
    phone: contact.phone ? formatPhone(contact.phone) : null,
    amount: deal.amount,
    paid: payments.reduce((s, p) => s + (p.kind === "refund" ? -p.amount : p.amount), 0),
    source: deal.utm ? acquisitionChannel(toAttribution(deal.utm), deal.source) : dealSourceLabels[deal.source],
    stage: stage ? { id: stage.id, name: stage.name, color: stage.color, kind: stage.kind } : null,
    stages: stages.filter((s) => s.pipelineId === stage?.pipelineId).map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind })),
    assigneeId: deal.assigneeId,
    assignee: deal.assigneeId ? (names.get(deal.assigneeId) ?? null) : null,
    unsorted: deal.unsorted,
    tags: deal.tags,
    customFields: deal.customFields,
    createdAt: deal.createdAt.toISOString(),
    perms: { canEdit: edit, canMove: edit, canInvoice: edit && can(staff, "chats.send"), mine: works },
    maxDiscountPercent: maxDiscount,
    chatId: card.convs[0]?.id ?? null,
    client: card.client ? { id: card.client.id, name: card.client.name } : null,
    order: card.order ? { id: card.order.id, number: card.order.number, status: card.order.status, amount: card.order.amount, plan: card.order.plan } : null,
    tasks: card.taskRows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, done: !!t.doneAt })),
    notes: card.noteRows.slice(0, 30).map((n) => ({ id: n.id, text: n.text, at: n.createdAt.toISOString(), author: n.authorId ? (names.get(n.authorId) ?? null) : null })),
    payments: payments.slice(0, 20).map((p) => ({ id: p.id, amount: p.amount, kind: p.kind, method: p.method, at: p.paidAt.toISOString() })),
    invoices: invoiceViews(invoiceRows, { now: new Date(), withLink: edit }),
  };
}
