/**
 * Отчёты руководителя в приложении CRM: «Реестр продаж», «Аналитика продаж», «Статистика лидов» — те же загрузка и
 * расчёт, что у страниц сайта (salesRegisterScreen, loadSalesAnalytics, leadStatsScreen), форма оплаты — setPayFormAction.
 */
import { apiStaff } from "@/server/api";
import { can, canWork, contactView } from "@/server/access";
import { container } from "@/server/container";
import { getSetting, listFields } from "@/modules/workspace";
import { PAY_FORM_KEY, PAY_FORM_OPTIONS, parseFeeRates } from "@/shared/domain/expenses";
import { storeTimeZone } from "@/shared/domain/time";
import { formatPhone } from "@/shared/domain/phone";
import { financePeriod, type FinancePeriod } from "@/modules/reporting/ui/finance-screen";
import { leadStatsScreen, salesRegisterScreen } from "@/modules/reporting/ui/lead-stats";
import { waitLabel } from "@/modules/reporting/ui/response-wait";
import { formatDate } from "@/lib/dates";
import { loadSalesAnalytics, mins, num, pct } from "@/server/sales-analytics";
import { setPayFormAction } from "@/app/admin/sales/actions";
import type { Handlers } from "../../app";
import { refused } from "./common";

const PRESETS = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "month", label: "Месяц" },
  { id: "prev", label: "Прошлый месяц" },
];
const periodOut = (p: FinancePeriod) => ({ preset: p.preset, label: p.label, first: p.first, last: p.last, presets: PRESETS });

export const crmAnalyticsHandlers: Pick<Handlers, "crmSalesRegister" | "crmSalesPayForm" | "crmAnalytics" | "crmLeadStats"> = {
  async crmSalesRegister({ req, input }) {
    const staff = await apiStaff(req, "analytics.view");
    const tz = storeTimeZone();
    const period = financePeriod({ preset: input.p, from: input.from, to: input.to, now: new Date(), tz });
    const c = container();
    const [rows, admins, feeSetting, dealFields] = await Promise.all([c.reporting.salesRegister({ from: period.from, to: period.to }), c.access.queries.allStaff(), getSetting("finance.fees"), listFields("deal")]);
    const showFees = can(staff, "finance.view");
    const s = salesRegisterScreen({ rows, staff: admins, visible: (id) => canWork(staff, id), contact: (phone) => (phone ? contactView(staff, { phone: formatPhone(phone) }).phone : ""), tz, feeRates: showFees ? parseFeeRates(feeSetting) : {} });
    const t = s.totals;
    return {
      period: periodOut(period),
      totals: { count: t.count, settled: t.settled, price: t.price, paid: t.paid, rest: t.rest, fee: t.fee },
      rows: s.rows.map((r) => ({ id: r.id, number: r.number, day: r.day, client: r.client, phone: r.phone, city: r.city, channel: r.channel, manager: r.manager, plan: r.plan, price: r.price, paid: r.paid, rest: r.rest, state: r.state, method: r.method, payForm: r.payForm, fee: r.fee, eventDate: r.eventDate, orderId: r.orderId ?? null })),
      canEdit: can(staff, "deals.edit"),
      payForms: dealFields.find((f) => f.key === PAY_FORM_KEY)?.options ?? [...PAY_FORM_OPTIONS],
      showFees,
    };
  },

  async crmSalesPayForm({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await setPayFormAction(input.dealId, input.body.form);
    if (!r.ok) return refused(r.error);
    return { ok: true as const, message: input.body.form ? `Форма оплаты: ${input.body.form}` : "Форма оплаты снята" };
  },

  async crmAnalytics({ req, input }) {
    const staff = await apiStaff(req, "analytics.view");
    const a = await loadSalesAnalytics(staff, input);
    const { t, p, change, resp, flow } = a;
    return {
      period: periodOut(a.period),
      pipelines: a.pipelines.map((x) => ({ id: x.id, label: x.name })),
      pipelineId: a.pipeline.id,
      flow: a.showProfit ? { incoming: flow.incoming, refunds: flow.refunds, fees: flow.fees, tax: flow.tax, net: flow.net, other: flow.other, profit: flow.profit } : null,
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
        rows: a.funnel.map(({ st, n, prevN, time }) => ({ id: st.id, name: st.name, kind: st.kind, reached: n, prev: prevN, conversion: prevN !== null ? pct(n, prevN) : null, timeLabel: time && st.kind === "open" ? mins(num(time.avg_sec)) : null })),
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
      longest: resp.longest.map((w) => ({ conversationId: w.conversationId, askedLabel: formatDate(w.asked, true), waitLabel: waitLabel(w.minutes, a.shift), answered: w.answered })),
      calls: { incoming: num(a.c.incoming), outgoing: num(a.c.outgoing), missed: num(a.c.missed), handled: num(a.c.handled), talkMinutes: Math.round(num(a.c.talk) / 60), unanswered: resp.total.unanswered, asked: resp.total.asked },
      lost: a.lost.rows.map((r) => ({ label: String(r.reason), value: num(r.n) })),
    };
  },

  async crmLeadStats({ req, input }) {
    const staff = await apiStaff(req, "analytics.view");
    const tz = storeTimeZone();
    const now = new Date();
    const period = financePeriod({ preset: input.p, from: input.from, to: input.to, now, tz });
    const c = container();
    const [data, admins] = await Promise.all([c.reporting.leadStats({ from: period.prev.from, to: period.to, first: period.first, last: period.last }), c.access.queries.allStaff()]);
    // Как на странице: менеджеры — те, чьи сделки есть в данных и с кем сотрудник может работать; расход — руководству.
    const managers = admins.filter((m) => canWork(staff, m.id) && data.deals.some((d) => d.assigneeId === m.id));
    const managerId = input.m && managers.some((m) => m.id === input.m) ? input.m : null;
    const showSpend = staff.scope === "all" && can(staff, "finance.view");
    const s = leadStatsScreen({ period, ...data, staff: admins, visible: (id) => canWork(staff, id), showSpend, managerId, tz, now });
    const t = s.totals;
    const cut = (r: { key?: string | null; label: string; leads: number; paid: number; conversion: number | null }) => ({ key: r.key ?? null, label: r.label, leads: r.leads, paid: r.paid, conversion: r.conversion });
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
      daily: s.daily.map((d) => ({ day: d.day, leads: d.leads, junk: d.junk, invoices: d.invoices, payments: d.payments, first: d.first, agreed: d.agreed, spend: d.spend, conversion: d.conversion, cpl: d.cpl, cac: d.cac, roas: d.roas })),
      stages: s.stages.map((x) => ({ key: x.key, label: x.label, kind: x.kind, pipeline: x.pipeline, count: x.count, share: x.share, paid: x.paid })),
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
  },
};
