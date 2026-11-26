/**
 * Обращения в приложении CRM: список, карточка и разбор — те же данные и действия, что /admin/support (руководитель с
 * «Настройками CRM» видит и ведёт все, остальные — только свои; статус и уведомление автора — updateTicketAction).
 */
import { apiStaff, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { chatMessageText } from "@/modules/support";
import { SUPPORT_KIND_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_STATUSES, type SupportStatus } from "@/shared/domain/support";
import { canOpenTicket, seesAllTickets } from "@/server/support-access";
import { notifyTicketAction, updateTicketAction } from "@/server/crm-actions/support";
import type { Handlers } from "../../app";
import { refused } from "./common";

const STATUSES = SUPPORT_STATUSES.map((s) => ({ id: s, label: SUPPORT_STATUS_LABELS[s] }));

async function ticketFor(req: Request, number: number) {
  const staff = await apiStaff(req);
  const t = await container().support.tickets.byNumber(number);
  if (!t || !canOpenTicket(staff, t)) throw new HttpError(404, "notFound");
  return { staff, t };
}

export const crmSupportHandlers: Pick<Handlers, "crmSupportList" | "crmSupportTicket" | "crmSupportUpdate" | "crmSupportNotify"> = {
  async crmSupportList({ req, input }) {
    const staff = await apiStaff(req);
    const all = seesAllTickets(staff);
    const mine = all ? undefined : staff.user.id;
    const status = input.status && (SUPPORT_STATUSES as readonly string[]).concat("all").includes(input.status) ? (input.status as SupportStatus | "all") : "open";
    const tickets = container().support.tickets;
    const [list, counts] = await Promise.all([tickets.list({ status, q: input.q?.trim() ?? "", createdBy: mine, limit: 200 }), tickets.counts(mine)]);
    return {
      tickets: list.map((t) => ({
        id: t.id,
        number: t.number,
        status: t.status,
        statusLabel: SUPPORT_STATUS_LABELS[t.status],
        kindLabel: SUPPORT_KIND_LABELS[t.kind],
        urgent: t.urgency === "urgent",
        text: t.summary.split("\n")[0]?.replace(/^Суть:\s*/i, "") || t.description || "Без описания — смотрите вложения",
        reporter: t.reporterName,
        attachments: t.attachments.length,
        createdAt: t.createdAt.toISOString(),
      })),
      counts: { ...counts },
      statuses: STATUSES,
      canManage: all,
    };
  },

  async crmSupportTicket({ req, input }) {
    const { staff, t } = await ticketFor(req, input.number);
    return {
      id: t.id,
      number: t.number,
      status: t.status,
      statusLabel: SUPPORT_STATUS_LABELS[t.status],
      statuses: STATUSES,
      kindLabel: SUPPORT_KIND_LABELS[t.kind],
      urgent: t.urgency === "urgent",
      summary: t.summary,
      description: t.description,
      place: t.place,
      expected: t.expected,
      reporter: t.reporterName,
      createdAt: t.createdAt.toISOString(),
      files: t.attachments.map((a) => ({
        id: a.id,
        name: a.recorded ? "Голосовое, записано в форме" : a.name,
        kind: a.kind,
        size: a.size,
        url: `/api/admin/support/${t.id}/files/${a.id}`,
        transcript: a.transcript ?? null,
        transcriptError: a.transcriptError ?? null,
      })),
      chatId: t.chat?.conversationId ?? null,
      chat: (t.chat?.messages ?? []).map((m) => ({ id: m.id, inbound: m.direction === "in", text: chatMessageText(m), at: m.at })),
      resolution: t.resolution,
      devNote: seesAllTickets(staff) ? t.devNote : "",
      commits: t.commits.map((c) => ({ sha: c.sha, subject: c.subject, at: c.at })),
      history: t.history.map((e) => ({ at: e.at, by: e.by, text: e.text })),
      notifiedAt: t.notifiedAt?.toISOString() ?? null,
      notifyError: t.notifyError,
      canManage: seesAllTickets(staff),
    };
  },

  async crmSupportUpdate({ req, input }) {
    const { t } = await ticketFor(req, input.number);
    if (!(SUPPORT_STATUSES as readonly string[]).includes(input.body.status)) return refused("Выберите статус из списка");
    const r = await updateTicketAction(t.number, { id: t.id, status: input.body.status as SupportStatus, resolution: input.body.resolution, devNote: input.body.devNote, notify: input.body.notify });
    if (!r.ok) return refused(r.error);
    return { ok: true, message: r.notified === true ? "Сохранено, автору написали" : r.notified === false ? "Сохранено, но сообщение автору не ушло" : "Сохранено" };
  },

  async crmSupportNotify({ req, input }) {
    const { t } = await ticketFor(req, input.number);
    const r = await notifyTicketAction(t.number, t.id);
    if (!r.ok) return refused(r.error);
    return { ok: true, message: r.notified === false ? "Сообщение не ушло — проверьте WhatsApp магазина" : "Автору написали" };
  },
};
