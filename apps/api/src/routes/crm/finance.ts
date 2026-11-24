/**
 * Деньги в приложении CRM: «Финансы», «Расходы», «Прибыль» — модели тех же функций экранов сайта и те же server actions
 * (права, «только свои», журнал действий). Страницы сайта и эти обработчики считают одинаково — расхождений нет.
 */
import { apiStaff } from "@/server/api";
import { can, canWork } from "@/server/access";
import { container } from "@/server/container";
import { loadProfit } from "@/server/money-flow";
import { listFields } from "@/modules/workspace";
import { storeTimeZone } from "@/shared/domain/time";
import { channels } from "@/shared/domain/channels";
import { expenseCategories, expenseCategoryKeys, expenseGroupKeys, expenseGroupOf, expenseGroups, PAY_FORM_KEY, PAY_FORM_OPTIONS } from "@/shared/domain/expenses";
import { financePeriod, financeScreen, type FinancePeriod } from "@/modules/reporting/ui/finance-screen";
import { expensesScreen } from "@/modules/reporting/ui/profit-screen";
import { resolveFinanceIssueAction, reviewDealPaymentAction, undoFinanceResolutionAction } from "@/app/admin/finance/actions";
import { reviewOrderPaymentAction } from "@/app/admin/actions";
import { addExpenseAction, removeExpenseAction, updateExpenseAction } from "@/app/admin/expenses/actions";
import { saveFeeRatesAction } from "@/app/admin/profit/actions";
import type { Handlers } from "../../app";
import { refused } from "./common";

const PRESETS = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "month", label: "Месяц" },
  { id: "prev", label: "Прошлый месяц" },
];

const RECENT = 50;
const EXPECTED = 200;

function periodOf(q: { p?: string; from?: string; to?: string }) {
  const tz = storeTimeZone();
  return { tz, period: financePeriod({ preset: q.p, from: q.from, to: q.to, now: new Date(), tz }) };
}

const periodOut = (p: FinancePeriod) => ({ preset: p.preset, label: p.label, first: p.first, last: p.last, presets: PRESETS });

const done = (message: string) => ({ ok: true as const, message });

type FinanceHandlers = "crmFinance" | "crmFinanceReview" | "crmFinanceResolve" | "crmFinanceUndo" | "crmExpenses" | "crmExpenseAdd" | "crmExpenseUpdate" | "crmExpenseRemove" | "crmProfit" | "crmProfitFees";

export const crmFinanceHandlers: Pick<Handlers, FinanceHandlers> = {
  async crmFinance({ req, input }) {
    const staff = await apiStaff(req, "analytics.view");
    const { tz, period } = periodOf(input);
    const now = new Date();
    const showFlow = staff.scope === "all" && can(staff, "finance.view");
    const c = container();
    const [data, admins, profit] = await Promise.all([c.reporting.finance({ from: period.prev.from, to: period.to }), c.access.queries.allStaff(), showFlow ? loadProfit(period, tz) : null]);
    const s = financeScreen({ period, ...data, staff: admins, visible: (id) => canWork(staff, id), viewerId: staff.context.isOwner ? null : staff.user.id, tz, now });
    const t = s.totals;
    const reviewDeal = can(staff, "team.manage");
    const reviewOrder = can(staff, "team.manage", "orders.edit");
    const money = (m: (typeof s.recent)[number]) => ({
      key: m.key,
      dateLabel: m.dateLabel,
      amount: m.amount,
      refund: m.refund,
      method: m.method,
      what: m.what,
      refs: m.refs,
      client: m.client,
      manager: m.manager,
      acceptedBy: m.acceptedBy,
      receiptUrl: m.receiptHref,
      check: m.check,
    });
    const f = profit?.screen.flow;
    return {
      period: periodOut(period),
      own: staff.scope !== "all",
      totals: {
        net: t.net,
        incoming: t.incoming,
        refunds: t.refunds,
        online: t.online,
        manual: t.manual,
        count: t.count,
        refundCount: t.refundCount,
        prevNet: t.prevNet,
        delta: t.delta,
        expected: t.expected,
        expectedReady: t.expectedReady,
        postpay: t.postpay,
        postpayCount: t.postpayCount,
        overpaid: t.overpaid,
        overpaidCount: t.overpaidCount,
        reviewCount: t.review.count,
        reviewSum: t.review.sum,
      },
      flow: f ? { incoming: f.incoming, refunds: f.refunds, fees: f.fees, tax: f.tax, net: f.net, other: f.other, profit: f.profit } : null,
      byDay: s.byDay.map((d) => ({ date: d.date, incoming: d.incoming, refunds: d.refunds })),
      byMethod: s.byMethod.filter((b) => b.value > 0),
      byManager: s.byManager.map((m) => ({ key: m.id, label: m.label, value: m.value, count: m.count })),
      review: s.review.map((r) => ({
        key: r.key,
        kind: r.kind,
        id: r.id,
        amount: r.amount,
        dateLabel: r.dateLabel,
        what: r.what,
        refund: r.refund,
        mine: r.mine,
        refs: r.refs,
        client: r.client,
        manager: r.manager,
        acceptedBy: r.acceptedBy,
        receiptUrl: r.receiptHref,
        invoice: r.invoice,
        note: r.note,
      })),
      issues: s.issues.map((i) => ({ key: i.key, kind: i.kind, title: i.title, href: i.href, ref: i.ref, client: i.client, manager: i.manager, amount: i.amount, note: i.note, dateLabel: i.dateLabel, target: i.target, canUpgrade: i.canUpgrade })),
      resolved: s.resolved.map((r) => ({ id: r.id, title: r.title, ref: r.ref, client: r.client, href: r.href, amount: r.amount, note: r.note, by: r.by, dateLabel: r.dateLabel, stillOpen: r.stillOpen })),
      recent: s.recent.slice(0, RECENT).map(money),
      refunds: s.refunds.map(money),
      expected: {
        rows: s.expected.rows.slice(0, EXPECTED).map((e) => ({ key: e.key, kind: e.kind, href: e.href, ref: e.ref, client: e.client, manager: e.manager, total: e.total, paid: e.paid, left: e.left, group: e.group, bookLabel: e.bookLabel, dueLabel: e.dueLabel, overdue: e.overdue, invoice: e.invoice, note: e.note })),
        groups: s.expected.groups,
        total: t.expectedAll,
      },
      perms: { reviewDeal, reviewOrder, resolveDeal: reviewDeal, resolveOrder: reviewOrder, refundDeal: can(staff, "deals.edit"), editOrder: can(staff, "orders.edit") },
    };
  },

  async crmFinanceReview({ req, input }) {
    await apiStaff(req, "analytics.view");
    const r = input.body.kind === "deal" ? await reviewDealPaymentAction(input.body.id) : await reviewOrderPaymentAction(input.body.id);
    if (r.error) return refused(r.error);
    return done(("ok" in r && typeof r.ok === "string" && r.ok) || "Отмечено: проверено");
  },

  async crmFinanceResolve({ req, input }) {
    await apiStaff(req, "analytics.view");
    const r = await resolveFinanceIssueAction(input.body.key, input.body.amount, input.body.note);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Отмечено решённым");
  },

  async crmFinanceUndo({ req, input }) {
    await apiStaff(req, "analytics.view");
    const r = await undoFinanceResolutionAction(input.resolutionId);
    if (r.error) return refused(r.error);
    return done(r.ok ?? "Решение отменено");
  },

  async crmExpenses({ req, input }) {
    const staff = await apiStaff(req, "finance.view");
    const { period } = periodOf(input);
    const c = container();
    const [rows, admins] = await Promise.all([c.reporting.expenses(period.first, period.last), c.access.queries.allStaff()]);
    const s = expensesScreen({ period, expenses: rows, staff: admins });
    return {
      period: periodOut(period),
      total: s.total,
      byCategory: s.byCategory,
      byGroup: expenseGroupKeys.map((key) => {
        const list = s.rows.filter((r) => expenseGroupOf(r.category) === key);
        return { key, label: expenseGroups[key], value: list.reduce((n, r) => n + r.amount, 0), count: list.length };
      }),
      rows: s.rows.map((r) => ({ id: r.id, source: r.source, day: r.day, category: r.category, categoryLabel: r.label, name: r.name, title: r.title, amount: r.amount, quantity: r.quantity, note: r.note, channel: r.channel, by: r.by })),
      canManage: can(staff, "finance.manage"),
      categories: expenseCategoryKeys.map((k) => ({ id: k, label: expenseCategories[k], group: expenseGroupOf(k) })),
      channels: Object.entries(channels).map(([id, label]) => ({ id, label })),
    };
  },

  async crmExpenseAdd({ req, input }) {
    await apiStaff(req, "finance.manage");
    const b = input.body;
    const r = await addExpenseAction({ ...b, quantity: b.quantity ?? "", channel: b.channel ?? undefined });
    if (!r.ok) return refused(r.error);
    return done("Расход внесён");
  },

  async crmExpenseUpdate({ req, input }) {
    await apiStaff(req, "finance.manage");
    const b = input.body;
    const r = await updateExpenseAction(input.expenseId, { ...b, quantity: b.quantity ?? "", channel: b.channel ?? undefined });
    if (!r.ok) return refused(r.error);
    return done("Сохранено");
  },

  async crmExpenseRemove({ req, input }) {
    await apiStaff(req, "finance.manage");
    const r = await removeExpenseAction(input.expenseId, input.source);
    if (!r.ok) return refused(r.error);
    return done("Расход удалён");
  },

  async crmProfit({ req, input }) {
    const staff = await apiStaff(req, "finance.view");
    const { tz, period } = periodOf(input);
    const [{ screen: s, feeRates, taxRate }, dealFields] = await Promise.all([loadProfit(period, tz), listFields("deal")]);
    const t = s.totals;
    // Строки отчёта — как на странице «Прибыль».
    const lines: { label: string; value: number; prev: number; kind: "sum" | "sub" | "result" | null; minus: boolean }[] = [
      { label: "Пришло от клиентов", value: t.incoming, prev: t.prev.revenue, kind: "sub", minus: false },
      { label: "Возвраты клиентам", value: t.refunds, prev: 0, kind: "sub", minus: true },
      { label: "Выручка", value: t.revenue, prev: t.prev.revenue, kind: "sum", minus: false },
      ...s.byCategory.filter((c) => c.group === "cogs").map((c) => ({ label: c.label, value: c.value, prev: c.prev, kind: "sub" as const, minus: true })),
      { label: "Валовая прибыль", value: t.gross, prev: t.prev.revenue - t.prev.cogs, kind: "sum", minus: false },
      ...expenseGroupKeys
        .filter((g) => g !== "cogs")
        .flatMap((g) => [
          { label: expenseGroups[g], value: t[g], prev: t.prev[g], kind: null, minus: true },
          ...(g === "marketing" ? [] : s.byCategory.filter((c) => c.group === g).map((c) => ({ label: c.label, value: c.value, prev: c.prev, kind: "sub" as const, minus: true }))),
        ]),
      { label: "Прибыль", value: t.profit, prev: t.prev.profit, kind: "result", minus: false },
    ];
    const u = s.unit;
    return {
      period: periodOut(period),
      totals: { revenue: t.revenue, expenses: t.expenses, profit: t.profit, margin: t.margin, deltaRevenue: t.delta.revenue, deltaExpenses: t.delta.expenses, deltaProfit: t.delta.profit },
      lines,
      step: s.step,
      rows: s.rows.map((r) => ({ key: r.key, label: r.label, revenue: r.revenue, expenses: r.expenses, profit: r.profit })),
      flow: { incoming: s.flow.incoming, refunds: s.flow.refunds, fees: s.flow.fees, tax: s.flow.tax, net: s.flow.net, other: s.flow.other, profit: s.flow.profit },
      unit: {
        leads: u.leads,
        buyers: u.buyers,
        orders: u.orders,
        conversion: u.conversion,
        cpl: u.cpl,
        cac: u.cac,
        roasCash: u.roasCash,
        roasFirst: u.roasFirst,
        roasAgreed: u.roasAgreed,
        adShare: u.adShare,
        avgFirst: u.avgFirst,
        avgAgreed: u.avgAgreed,
        printPerBook: u.printPerBook,
        profitPerBuyer: u.profitPerBuyer,
      },
      fees: { auto: s.fees.auto, base: s.fees.base, byForm: s.fees.byForm },
      tax: { rate: s.tax.rate, auto: s.tax.auto },
      noExpenses: s.noExpenses,
      canManage: can(staff, "finance.manage"),
      payForms: dealFields.find((f) => f.key === PAY_FORM_KEY)?.options ?? [...PAY_FORM_OPTIONS],
      feeRates,
    };
  },

  async crmProfitFees({ req, input }) {
    await apiStaff(req, "finance.manage");
    const r = await saveFeeRatesAction(input.body.rates, input.body.taxRate);
    if (!r.ok) return refused(r.error);
    return done("Проценты сохранены");
  },
};
