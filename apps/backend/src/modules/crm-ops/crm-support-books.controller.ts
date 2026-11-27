import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { bookLine, progressRatio, progressText } from "@/lib/content/crm-labels";
import { getTheme, getThemes } from "@/lib/content/themes";
import { formatDate, nowMs } from "@/lib/dates";
import { getOccasion, parseDay } from "@/lib/occasions";
import { STALLED_DAYS } from "@/modules/reporting";
import { chatMessageText } from "@/modules/support";
import { SUPPORT_KIND_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_STATUSES, type SupportStatus } from "@/shared/domain/support";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CRM_OPS_PORTS, crmOpsCall, refused, type CrmOpsPorts } from "./crm-ops.tokens";

const BOOK_FILTERS = [
  { id: "all", label: "Все" },
  { id: "writing", label: "Пишутся" },
  { id: "stalled", label: `Заброшены (${STALLED_DAYS}+ дн.)` },
  { id: "ready", label: "Почти готовы" },
  { id: "ordered", label: "Заказаны" },
];

const SUPPORT_STATUS_OPTIONS = SUPPORT_STATUSES.map((s) => ({ id: s, label: SUPPORT_STATUS_LABELS[s] }));

const isSupportStatus = (value: string): value is SupportStatus => SUPPORT_STATUSES.some((s) => s === value);

const parseSupportFilter = (value: string | undefined): SupportStatus | "open" | "all" => {
  if (!value) return "open";
  if (value === "all") return "all";
  return isSupportStatus(value) ? value : "open";
};

const seesAllTickets = (staff: StaffMember) => staff.context.can("settings.manage");

const canOpenTicket = (staff: StaffMember, ticket: { createdBy: string | null }) =>
  seesAllTickets(staff) || (Boolean(ticket.createdBy) && ticket.createdBy === staff.user.id);

/**
 * «Книги» (2 маршрута) и «Обращения поддержки» (4 маршрута) в API v1 CRM.
 * Права: для книг — `clients.view` / `clients.edit`; для обращений — руководитель (`settings.manage`) видит и ведёт все,
 * остальные сотрудники — только свои (проверка видимости до обновления и уведомления).
 */
@Controller()
export class CrmSupportBooksController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CRM_OPS_PORTS) private readonly ports: CrmOpsPorts,
  ) {}

  private async ticketFor(staff: StaffMember, number: number) {
    const ticket = await this.ports.supportTicketByNumber(number);
    if (!ticket || !canOpenTicket(staff, ticket)) throw new ApiError(404, "notFound");
    return ticket;
  }

  @Endpoint("crmBooks")
  @Permissions("clients.view")
  async books(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmBooks">): Promise<Output<"crmBooks">> {
    const themes = getThemes("ru");
    const ru = messagesFor("ru").common;
    const f = input.f ?? "all";
    const theme = input.theme && themes.some((t) => t.id === input.theme) ? input.theme : undefined;
    const rows = await this.ports.bookList(f, {
      q: input.q,
      theme,
      staleDays: STALLED_DAYS,
      now: nowMs(),
      viewer: { userId: staff.user.id, seesAll: staff.scope === "all" },
    });
    return {
      filter: f,
      filters: BOOK_FILTERS,
      themes: themes.map((t) => ({ id: t.id, label: t.name })),
      rows: rows.map((r) => {
        const idle = Math.floor((nowMs() - r.book.updatedAt.getTime()) / 86_400_000);
        const occ = r.book.occasion ? getOccasion(r.book.occasion) : null;
        const occasion = [occ ? ru.occasions[occ.id].label : null, r.book.occasionDate ? ru.date(parseDay(r.book.occasionDate)) : null]
          .filter(Boolean)
          .join(" · ");
        return {
          bookId: r.book.id,
          title: r.book.title ?? "",
          line: bookLine({
            theme: r.book.theme,
            themeShort: getTheme(r.book.theme).short,
            authorName: r.book.authorName,
            recipientName: r.book.recipientName,
          }),
          ownerId: r.owner.id,
          owner: r.owner.name || r.owner.email,
          status: r.book.status,
          progress: progressRatio({ theme: r.book.theme, ...r }),
          progressText: progressText({ theme: r.book.theme, ...r }),
          idleDays: idle,
          stale: r.book.status === "draft" && idle >= STALLED_DAYS,
          photos: r.photos,
          occasion: occasion || null,
          remindedLabel: r.owner.remindedAt ? formatDate(r.owner.remindedAt) : null,
          dealId: r.deal?.id ?? null,
          dealNumber: r.deal?.number ?? null,
        };
      }),
      remindable: [...new Set(rows.filter((r) => r.book.status === "draft" && !r.hasOrder).map((r) => r.owner.id))],
      canRemind: staff.context.can("clients.edit"),
      staleDays: STALLED_DAYS,
    };
  }

  @Endpoint("crmBooksRemind")
  @Permissions("clients.edit")
  remindBooks(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmBooksRemind">,
  ): Promise<Output<"crmBooksRemind">> {
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    return this.ports.remindMany(call, input.body.clientIds);
  }

  @Endpoint("crmSupportList")
  async supportList(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmSupportList">): Promise<Output<"crmSupportList">> {
    const all = seesAllTickets(staff);
    const mine = all ? undefined : staff.user.id;
    const status = parseSupportFilter(input.status);
    const [list, counts] = await Promise.all([
      this.ports.supportList({ status, q: input.q?.trim() ?? "", createdBy: mine, limit: 200 }),
      this.ports.supportCounts(mine),
    ]);
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
      statuses: SUPPORT_STATUS_OPTIONS,
      canManage: all,
    };
  }

  @Endpoint("crmSupportTicket")
  async supportTicket(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmSupportTicket">): Promise<Output<"crmSupportTicket">> {
    const t = await this.ticketFor(staff, input.number);
    const all = seesAllTickets(staff);
    return {
      id: t.id,
      number: t.number,
      status: t.status,
      statusLabel: SUPPORT_STATUS_LABELS[t.status],
      statuses: SUPPORT_STATUS_OPTIONS,
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
      chat: (t.chat?.messages ?? []).map((m) => ({
        id: m.id,
        inbound: m.direction === "in",
        text: chatMessageText(m),
        at: m.at,
      })),
      resolution: t.resolution,
      devNote: all ? t.devNote : "",
      commits: t.commits.map((c) => ({ sha: c.sha, subject: c.subject, at: c.at })),
      history: t.history.map((e) => ({ at: e.at, by: e.by, text: e.text })),
      notifiedAt: t.notifiedAt?.toISOString() ?? null,
      notifyError: t.notifyError,
      canManage: all,
    };
  }

  @Endpoint("crmSupportUpdate")
  async supportUpdate(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSupportUpdate">,
  ): Promise<Output<"crmSupportUpdate"> | Response> {
    const t = await this.ticketFor(staff, input.number);
    if (!isSupportStatus(input.body.status)) return refused("Выберите статус из списка");
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.supportUpdate(call, t.number, {
      id: t.id,
      status: input.body.status,
      resolution: input.body.resolution,
      devNote: input.body.devNote,
      notify: input.body.notify,
    });
    if (!r.ok) return refused(r.error);
    return {
      ok: true,
      message: r.notified === true ? "Сохранено, автору написали" : r.notified === false ? "Сохранено, но сообщение автору не ушло" : "Сохранено",
    };
  }

  @Endpoint("crmSupportNotify")
  async supportNotify(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSupportNotify">,
  ): Promise<Output<"crmSupportNotify"> | Response> {
    const t = await this.ticketFor(staff, input.number);
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.supportNotify(call, t.number, t.id);
    if (!r.ok) return refused(r.error);
    return {
      ok: true,
      message: r.notified === false ? "Сообщение не ушло — проверьте WhatsApp магазина" : "Автору написали",
    };
  }
}
