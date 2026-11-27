import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import { change, mins, num, pct } from "@/lib/crm/numbers";
import { formatDate } from "@/lib/dates";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { financePeriod, type FinancePeriod } from "@/modules/reporting/ui/finance-screen";
import { leadStatsScreen, salesRegisterScreen } from "@/modules/reporting/ui/lead-stats";
import { waitLabel } from "@/modules/reporting/ui/response-wait";
import { PAY_FORM_KEY, PAY_FORM_OPTIONS, parseFeeRates } from "@/shared/domain/expenses";
import { formatPhone } from "@/shared/domain/phone";
import { parseWorkHours } from "@/shared/domain/schedule";
import { storeTimeZone } from "@/shared/domain/time";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CRM_OPS_PORTS, crmOpsCall, refused, type CrmOpsPorts } from "./crm-ops.tokens";

const PRESETS = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "month", label: "Месяц" },
  { id: "prev", label: "Прошлый месяц" },
];

const periodOut = (p: FinancePeriod) => ({ preset: p.preset, label: p.label, first: p.first, last: p.last, presets: PRESETS });

const AUTO_DEAL = [
  { id: "off", label: "не заводить (только заказы)" },
  { id: "registered", label: "зарегистрировался" },
  { id: "book_started", label: "начал книгу" },
  { id: "book_half", label: "написал половину книги" },
  { id: "book_ready", label: "почти закончил книгу" },
];

const BOT_MODES = [
  { id: "off", label: "Выключен", hint: "Отвечают только менеджеры." },
  { id: "always", label: "Всегда сразу", hint: "Бот отвечает на каждое новое обращение после короткой паузы и замолкает, как только напишет человек." },
  { id: "fallback", label: "Если менеджер не ответил", hint: "В рабочее время бот ждёт ответа человека, ночью отвечает сразу." },
  { id: "off_hours", label: "Только вне рабочего времени", hint: "Днём пишут менеджеры, ночью и в выходные — бот." },
];

/** «2026-12-16» → «16.12.2026», как в поле формы сайта. */
const ruDate = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Отчёты руководителя (4 маршрута: реестр продаж, форма оплаты, аналитика продаж, статистика лидов)
 * и настройки отдела продаж / режима AI-продажника (3 маршрута).
 */
@Controller()
export class CrmAnalyticsSettingsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CRM_OPS_PORTS) private readonly ports: CrmOpsPorts,
  ) {}

  @Endpoint("crmSalesRegister")
  @Permissions("analytics.view")
  async salesRegister(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmSalesRegister">): Promise<Output<"crmSalesRegister">> {
    const tz = storeTimeZone();
    const period = financePeriod({ preset: input.p, from: input.from, to: input.to, now: new Date(), tz });
    const [rows, admins, feeSetting, dealFields] = await Promise.all([
      this.ports.salesRegister({ from: period.from, to: period.to }),
      this.ports.allStaff(),
      this.ports.getSetting("finance.fees"),
      this.ports.listFields("deal"),
    ]);
    const showFees = staff.context.can("finance.view");
    const s = salesRegisterScreen({
      rows,
      staff: admins,
      visible: (id) => staff.context.canWork(id),
      contact: (phone) => (phone ? staff.context.contacts({ phone: formatPhone(phone) }).phone : ""),
      tz,
      feeRates: showFees ? parseFeeRates(feeSetting) : {},
    });
    const t = s.totals;
    return {
      period: periodOut(period),
      totals: { count: t.count, settled: t.settled, price: t.price, paid: t.paid, rest: t.rest, fee: t.fee },
      rows: s.rows.map((r) => ({
        id: r.id,
        number: r.number,
        day: r.day,
        client: r.client,
        phone: r.phone,
        city: r.city,
        channel: r.channel,
        manager: r.manager,
        plan: r.plan,
        price: r.price,
        paid: r.paid,
        rest: r.rest,
        state: r.state,
        method: r.method,
        payForm: r.payForm,
        fee: r.fee,
        eventDate: r.eventDate,
        orderId: r.orderId ?? null,
      })),
      canEdit: staff.context.can("deals.edit"),
      payForms: dealFields.find((f) => f.key === PAY_FORM_KEY)?.options ?? [...PAY_FORM_OPTIONS],
      showFees,
    };
  }

  @Endpoint("crmSalesPayForm")
  @Permissions("deals.edit")
  async salesPayForm(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSalesPayForm">,
  ): Promise<Output<"crmSalesPayForm"> | Response> {
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.setPayForm(call, input.dealId, input.body.form);
    if (!r.ok) return refused(r.error);
    return { ok: true as const, message: input.body.form ? `Форма оплаты: ${input.body.form}` : "Форма оплаты снята" };
  }

  @Endpoint("crmAnalytics")
  @Permissions("analytics.view")
  async analytics(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmAnalytics">,
  ): Promise<Output<"crmAnalytics">> {
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const a = await this.ports.loadSalesAnalytics(call, staff, input);
    const { t, p, resp, flow } = a;
    return {
      period: periodOut(a.period),
      pipelines: a.pipelines.map((x) => ({ id: x.id, label: x.name })),
      pipelineId: a.pipeline.id,
      flow: a.showProfit
        ? {
            incoming: flow.incoming,
            refunds: flow.refunds,
            fees: flow.fees,
            tax: flow.tax,
            net: flow.net,
            other: flow.other,
            profit: flow.profit,
          }
        : null,
      tiles: {
        received: flow.revenue,
        receivedDelta: change(flow.revenue, flow.prevRevenue),
        wonSum: num(t.revenue),
        wonSumDelta: change(num(t.revenue), num(p.revenue)),
        repeatRevenue: num(t.repeat_revenue),
        created: num(t.created),
        createdDelta: change(num(t.created), num(p.created)),
        repeatCreated: num(t.repeat_created),
        won: num(t.won),
        wonDelta: change(num(t.won), num(p.won)),
        repeatWon: num(t.repeat_won),
        conversion: pct(num(t.won), num(t.created)),
        cycle: mins(t.cycle === null || t.cycle === undefined ? null : num(t.cycle)),
        responseMedian: a.workMins(resp.total.median),
        inSla: a.share(resp.total.inSla),
        slaMinutes: a.sla,
        awaiting: num(a.awaiting.rows[0]?.n),
        botFirst: resp.bot.first,
        botMedian: resp.bot.median !== null ? mins(resp.bot.median * 60) : null,
      },
      funnel: {
        base: a.base,
        inWork: a.inWork,
        rows: a.funnel.map(({ st, n, prevN, time }) => ({
          id: st.id,
          name: st.name,
          kind: st.kind,
          reached: n,
          prev: prevN,
          conversion: prevN !== null ? pct(n, prevN) : null,
          timeLabel: time && st.kind === "open" ? mins(num(time.avg_sec)) : null,
        })),
      },
      channels: a.channelRows.map((r) => ({ key: r.key, label: r.label, created: r.created, won: r.won, revenue: r.revenue })),
      team: a.team.map((r) => ({
        id: String(r.id),
        name: r.name,
        deals: num(r.deals),
        won: num(r.won),
        revenue: num(r.revenue),
        received: num(r.received),
        open: num(r.open),
        messages: num(r.messages),
        phoneMessages: num(r.phone_messages),
        calls: num(r.calls),
        talkMinutes: Math.round(num(r.talk) / 60),
        tasksDone: num(r.tasks_done),
        tasksOverdue: num(r.tasks_overdue),
        responseLabel: r.resp ? a.workMins(r.resp.median) : "—",
        inSlaLabel: r.resp ? a.share(r.resp.inSla) : "—",
        planLabel: a.planPct(String(r.id)),
      })),
      longest: resp.longest.map((w) => ({
        conversationId: w.conversationId,
        askedLabel: formatDate(w.asked, true),
        waitLabel: waitLabel(w.minutes, a.shift),
        answered: w.answered,
      })),
      calls: {
        incoming: num(a.c.incoming),
        outgoing: num(a.c.outgoing),
        missed: num(a.c.missed),
        handled: num(a.c.handled),
        talkMinutes: Math.round(num(a.c.talk) / 60),
        unanswered: resp.total.unanswered,
        asked: resp.total.asked,
      },
      lost: a.lost.rows.map((r) => ({ label: String(r.reason), value: num(r.n) })),
    };
  }

  @Endpoint("crmLeadStats")
  @Permissions("analytics.view")
  async leadStats(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmLeadStats">): Promise<Output<"crmLeadStats">> {
    const tz = storeTimeZone();
    const now = new Date();
    const period = financePeriod({ preset: input.p, from: input.from, to: input.to, now, tz });
    const [data, admins] = await Promise.all([
      this.ports.leadStats({ from: period.prev.from, to: period.to, first: period.first, last: period.last }),
      this.ports.allStaff(),
    ]);
    const managers = admins.filter((m) => staff.context.canWork(m.id) && data.deals.some((d) => d.assigneeId === m.id));
    const managerId = input.m && managers.some((m) => m.id === input.m) ? input.m : null;
    const showSpend = staff.scope === "all" && staff.context.can("finance.view");
    const s = leadStatsScreen({
      period,
      ...data,
      staff: admins,
      visible: (id) => staff.context.canWork(id),
      showSpend,
      managerId,
      tz,
      now,
    });
    const t = s.totals;
    const cut = (r: { key?: string | null; label: string; leads: number; paid: number; conversion: number | null }) => ({
      key: r.key ?? null,
      label: r.label,
      leads: r.leads,
      paid: r.paid,
      conversion: r.conversion,
    });
    return {
      period: periodOut(period),
      managers: managers.map((m) => ({ id: m.id, label: m.name })),
      managerId,
      showSpend,
      totals: {
        leads: t.leads,
        junk: t.junk,
        paid: t.paid,
        conversion: t.conversion,
        open: t.open,
        lost: t.lost,
        repeat: t.repeat,
        avgCheck: t.avgCheck,
        medianHours: t.medianHours,
        payments: t.payments,
        paymentsFirst: t.paymentsFirst,
        paymentsAgreed: t.paymentsAgreed,
        invoices: t.invoices,
        spend: t.spend,
        cpl: t.cpl,
        cac: t.cac,
        roas: t.roas,
        roasAgreed: t.roasAgreed,
        adShare: t.adShare,
        deltaLeads: t.delta.leads,
        deltaPaid: t.delta.paid,
        deltaConversion: t.delta.conversion,
      },
      daily: s.daily.map((d) => ({
        day: d.day,
        leads: d.leads,
        junk: d.junk,
        invoices: d.invoices,
        payments: d.payments,
        first: d.first,
        agreed: d.agreed,
        spend: d.spend,
        conversion: d.conversion,
        cpl: d.cpl,
        cac: d.cac,
        roas: d.roas,
      })),
      stages: s.stages.map((x) => ({
        key: x.key,
        label: x.label,
        kind: x.kind,
        pipeline: x.pipeline,
        count: x.count,
        share: x.share,
        paid: x.paid,
      })),
      lost: s.lost,
      bySource: s.bySource.map(cut),
      buyersBySource: s.buyersBySource,
      byManager: s.byManager.map(cut),
      byRecipient: s.byRecipient.map(cut),
      byOccasion: s.byOccasion.map(cut),
      byLeadTime: s.byLeadTime.map(cut),
      byWeekday: s.byWeekday.map(cut),
      byHour: s.byHour.map(cut),
      payDelay: s.payDelay,
    };
  }

  @Endpoint("crmSettingsSales")
  @Permissions("settings.manage")
  async settingsSales(): Promise<Output<"crmSettingsSales">> {
    const [
      sla,
      workHours,
      autoDealFrom,
      unsorted,
      maxDiscount,
      wEnabled,
      wChat,
      reassign,
      mergeDays,
      digest,
      chatReward,
      wHelp,
      autoLetters,
      botMode,
    ] = await Promise.all([
      this.ports.getSetting("crm.slaMinutes"),
      this.ports.getSetting("crm.workHours"),
      this.ports.getSetting("crm.autoDealFrom"),
      this.ports.getSetting("crm.unsorted"),
      this.ports.getSetting("crm.maxDiscount"),
      this.ports.getSetting("widget.enabled"),
      this.ports.getSetting("widget.chat"),
      this.ports.getSetting("crm.reassignMinutes"),
      this.ports.mergeClosedDays(),
      this.ports.getSetting("crm.digest"),
      this.ports.getSetting("referral.chatReward"),
      this.ports.getSetting("widget.help"),
      this.ports.getSetting("notify.auto"),
      this.ports.getSetting("bot.mode"),
    ]);
    const wh = parseWorkHours(workHours);
    return {
      canManage: true,
      workDays: wh.days,
      from: wh.from,
      to: wh.to,
      off: (wh.off ?? []).map(ruDate).join("\n"),
      slaMinutes: Number(sla) || 15,
      reassignMinutes: reassign === "" || reassign === null ? 15 : Number(reassign) || 0,
      autoDealFrom: autoDealFrom || "off",
      autoDealOptions: AUTO_DEAL,
      mergeClosedDays: mergeDays,
      maxDiscount: Number(maxDiscount) || 0,
      unsorted: unsorted !== "off",
      digest: digest !== "off",
      autoLetters: autoLetters !== "off",
      chatReward: chatReward === "on",
      widgetEnabled: wEnabled !== "off",
      widgetChat: wChat !== "off",
      widgetHelp: wHelp !== "off",
      botMode: botMode || "off",
      botModes: BOT_MODES,
    };
  }

  @Endpoint("crmSettingsSalesSave")
  @Permissions("settings.manage")
  async settingsSalesSave(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSettingsSalesSave">,
  ): Promise<Output<"crmSettingsSalesSave"> | Response> {
    const b = input.body;
    const form = new FormData();
    for (const d of b.workDays) form.append("days", String(d));
    form.set("from", b.from);
    form.set("to", b.to);
    form.set("off", b.off);
    form.set("slaMinutes", String(b.slaMinutes));
    form.set("reassignMinutes", String(b.reassignMinutes));
    form.set("autoDealFrom", b.autoDealFrom);
    form.set("mergeClosedDays", String(b.mergeClosedDays));
    form.set("maxDiscount", String(b.maxDiscount));
    const flags = {
      unsorted: b.unsorted,
      digest: b.digest,
      autoLetters: b.autoLetters,
      chatReward: b.chatReward,
      widgetEnabled: b.widgetEnabled,
      widgetChat: b.widgetChat,
      widgetHelp: b.widgetHelp,
    };
    for (const [k, on] of Object.entries(flags)) if (on) form.set(k, "on");
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.saveCrmSettings(call, form);
    if (r.error) return refused(r.error);
    return { ok: true as const, message: r.ok ?? "Сохранено" };
  }

  @Endpoint("crmSettingsBotMode")
  @Permissions("settings.manage")
  async settingsBotMode(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @RequestLocale() locale: Locale,
    @Req() req: FastifyRequest,
    @Input() input: Parsed<"crmSettingsBotMode">,
  ): Promise<Output<"crmSettingsBotMode"> | Response> {
    const config = parseBotConfig(await this.ports.getSetting("bot.config"));
    const call = crmOpsCall(req, this.config, { staff, token, locale });
    const r = await this.ports.saveBot(call, { ...config, mode: input.body.mode });
    if (r.error) return refused(r.error);
    const label = BOT_MODES.find((m) => m.id === input.body.mode)?.label ?? input.body.mode;
    return { ok: true as const, message: `AI-продажник: ${label.toLowerCase()}` };
  }
}
