/**
 * Маршруты CRM контекста 7A (деньги и доставка заказа, файлы для типографии, «Финансы», «Расходы», «Прибыль», счета
 * сделки) — общий код mybook-api и бэкенда на Nest (см. orders.ts). Тексты — сотрудникам CRM, по-русски, как экраны
 * CRM на сайте. Права проверяет вызывающий — наборы ORDERS_API_PERMISSIONS ниже.
 */
import { getPlan, getPlans } from "@/config/site";
import { planName } from "@/i18n/labels";
import { getFormat } from "@/lib/book/formats";
import { formatDate } from "@/lib/dates";
import { deliveryLabels } from "@/modules/ordering/ui/labels";
import { isPrintedPlan, orderStatusLabel } from "@/modules/ordering/ui/status";
import { financePeriod, financeScreen, type FinancePeriod } from "@/modules/reporting/ui/finance-screen";
import { expensesScreen } from "@/modules/reporting/ui/profit-screen";
import { listFields } from "@/modules/workspace";
import { can, canSeeOrder, canWork, contactView, type Staff } from "@/server/access";
import { HttpError } from "@/server/api";
import { container } from "@/server/container";
import {
  changeOrderTermsAction,
  requestOrderRepriceAction,
  reviewOrderPaymentAction,
  saveAdminNoteAction,
  startPostpayAction,
  toggleBookLockAction,
  updateOrderAction,
  updateOrderDetailsAction,
  voidOrderPaymentAction,
} from "@/server/crm-actions/admin";
import { addExpenseAction, removeExpenseAction, updateExpenseAction } from "@/server/crm-actions/expenses";
import { resolveFinanceIssueAction, reviewDealPaymentAction, undoFinanceResolutionAction } from "@/server/crm-actions/finance";
import { cancelInvoiceAction, invoiceFormInfoAction, issueInvoiceAction, resendInvoiceAction } from "@/server/crm-actions/invoices";
import { saveFeeRatesAction } from "@/server/crm-actions/profit";
import { discountLimit } from "@/server/discount";
import { loadProfit } from "@/server/money-flow";
import { payFormOptions } from "@/server/pay-form";
import { POST as payRoute } from "@/server/site-handlers/admin/orders-id-payments";
import { POST as refundRoute } from "@/server/site-handlers/admin/orders-id-refunds";
import { channels } from "@/shared/domain/channels";
import { expenseCategories, expenseCategoryKeys, expenseGroupKeys, expenseGroupOf, expenseGroups, PAY_FORM_KEY, PAY_FORM_OPTIONS } from "@/shared/domain/expenses";
import { ORDER_STATUSES } from "@/shared/domain/orders";
import { staffLabel } from "@/shared/domain/staff";
import { storeTimeZone } from "@/shared/domain/time";
import { staffLayoutView } from "@/server/order-layout";
import { refused, type OrdersApiHandlers } from "./types";

/** Заказ, который сотрудник видит («только свои» — заказы своих клиентов); иначе 404. */
async function visibleOrder(staff: Staff, orderId: string) {
  const order = await container().ordering.queries.orderDetails(orderId);
  if (!order || !(await canSeeOrder(staff, order.id))) throw new HttpError(404, "notFound");
  return order;
}

type SiteRoute = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

/**
 * Маршрут сайта с файлом (чек оплаты, возврата) — те же поля формы и файл, тот же вход (заголовок Authorization
 * текущего запроса), та же логика денег. Ошибка — его ответ как есть, успех — его JSON.
 */
async function siteFileRoute(route: SiteRoute, req: Request, id: string, fields: Record<string, string | undefined>, file: Blob | undefined) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== "") form.set(k, v);
  if (file) form.set("file", file, (file as File).name || "receipt");
  const res = await route(new Request(req.url, { method: "POST", headers: { authorization: req.headers.get("authorization") ?? "" }, body: form }), { params: Promise.resolve({ id }) });
  return { res, data: res.ok ? ((await res.clone().json()) as Record<string, unknown>) : null };
}

const METHOD: Record<string, string> = { manual: "перевод или вручную", kaspi: "Kaspi", cloudpayments: "карта (CloudPayments)" };

/** Итог действия карточки заказа ({ ok } / { error }) — ответом контракта. */
const done = (r: { ok?: string; error?: string }, fallback = "Сохранено") => (r.error ? refused(r.error) : { ok: true as const, message: r.ok ?? fallback });

const FILES = [
  { kind: "block", label: "Блок книги", perm: "orders.files" },
  { kind: "cover", label: "Обложка", perm: "orders.files" },
  { kind: "layout", label: "Каркас обложки", perm: "orders.files" },
  { kind: "spec", label: "Техзадание", perm: "orders.files" },
  { kind: "reading", label: "PDF для чтения", perm: "orders.view" },
] as const;

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

const message = (text: string) => ({ ok: true as const, message: text });

type CrmRoute = keyof typeof ORDERS_API_PERMISSIONS | "crmOrderPay" | "crmOrderRefund";

export const crmMoneyApi: OrdersApiHandlers<CrmRoute> = {
  // ── CRM: деньги и доставка заказа ──────────────────────────────────────────────────────────────────────────

  async crmOrderMoney({ staff: s, input }) {
    const staff = s!;
    const c = container();
    const order = await visibleOrder(staff, input.orderId);
    const [rows, admins, payForms] = await Promise.all([c.ordering.payments.list(order.id), c.access.queries.allStaff(), payFormOptions()]);
    const name = new Map(admins.map((a) => [a.id, staffLabel(a)]));
    const plan = getPlan(order.plan);
    const printed = isPrintedPlan(order.plan);
    const canEdit = can(staff, "orders.edit");
    const canRepricePaid = can(staff, "orders.reprice_paid");
    const cancelled = order.status === "cancelled";
    const canTerms = canEdit && !cancelled && (!order.paidAt || canRepricePaid);
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      statusLabel: orderStatusLabel(order.status, "ru", printed),
      statuses: ORDER_STATUSES.map((st) => ({ id: st, label: orderStatusLabel(st, "ru", printed) })),
      printed,
      trackingNumber: order.trackingNumber ?? null,
      amount: order.amount,
      received: order.receivedAmount,
      // Как Order.refundable: по отменённому — всё полученное, по живому — переплата (проверяет и сервер).
      refundable: cancelled ? Math.max(0, order.receivedAmount) : Math.max(0, order.receivedAmount - order.amount),
      settled: !!order.paidAt,
      postpay: !!order.postpay,
      cancelled,
      payments: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        amount: r.amount,
        method: METHOD[r.method] ?? r.method,
        at: r.paidAt.toISOString(),
        note: r.note || null,
        receipt: !!r.receipt,
        payForm: r.payForm ?? null,
        by: r.createdById ? (name.get(r.createdById) ?? null) : null,
        reviewed: r.reviewedAt ? `${r.reviewedById ? (name.get(r.reviewedById) ?? "") : ""} ${formatDate(r.reviewedAt)}`.trim() : null,
        voided: !!r.voidedAt,
        voidReason: r.voidedAt ? (r.voidReason ?? "") : null,
      })),
      payForms,
      plan: order.plan,
      plans: getPlans().map((p) => ({ id: p.id, label: planName(p.id) + (p.hidden ? " (скрыт)" : ""), price: p.price })),
      // Договорённая цена первого экземпляра: скидка заказа без промокода — это и есть договорённость (как на сайте).
      agreed: order.discountAmount > 0 && !order.promoCode && plan ? order.itemsAmount - order.discountAmount - (order.itemsAmount - plan.price) : null,
      maxDiscountPercent: canTerms ? await discountLimit(staff) : null,
      canEdit,
      canVoid: canEdit && can(staff, "orders.payment_void"),
      canReview: canEdit && can(staff, "team.manage"),
      canTerms,
      canRequestReprice: canEdit && !cancelled && !!order.paidAt && !canRepricePaid,
    };
  },

  async crmOrderPay({ req, input }) {
    const { res, data } = await siteFileRoute(payRoute, req, input.orderId, { amount: input.amount, paidAt: input.paidAt, note: input.note, payForm: input.payForm, requestKey: input.requestKey }, input.files[0]);
    if (!data) return res;
    const overpaid = Number(data.overpaid ?? 0);
    return { ok: true, message: data.settled ? `Оплата записана, заказ оплачен${overpaid > 0 ? ` — переплата ${overpaid.toLocaleString("ru-RU")} ₸` : ""}` : "Оплата записана" };
  },

  async crmOrderRefund({ req, input }) {
    const { res, data } = await siteFileRoute(refundRoute, req, input.orderId, { amount: input.amount, note: input.note, requestKey: input.requestKey }, input.files[0]);
    if (!data) return res;
    return { ok: true, message: "Возврат записан" };
  },

  async crmOrderPaymentVoid({ input }) {
    return done(await voidOrderPaymentAction(input.paymentId, input.body.reason), "Платёж отменён");
  },

  async crmOrderPaymentReview({ input }) {
    return done(await reviewOrderPaymentAction(input.paymentId), "Отмечено: проверено");
  },

  async crmOrderPostpay({ input }) {
    return done(await startPostpayAction(input.orderId, input.body.reason));
  },

  async crmOrderTerms({ input }) {
    const form = new FormData();
    form.set("orderId", input.orderId);
    form.set("plan", input.body.plan);
    form.set("agreedTotal", input.body.agreedTotal === null ? "" : String(input.body.agreedTotal));
    if (input.body.reason) form.set("reason", input.body.reason);
    return done(await changeOrderTermsAction({}, form));
  },

  async crmOrderRepriceRequest({ input }) {
    return done(await requestOrderRepriceAction(input.orderId, String(input.body.price), input.body.reason));
  },

  async crmOrderDelivery({ input }) {
    const form = new FormData();
    form.set("orderId", input.orderId);
    form.set("status", input.body.status);
    if (input.body.trackingNumber !== undefined) form.set("trackingNumber", input.body.trackingNumber);
    if (input.body.note) form.set("note", input.body.note);
    return done(await updateOrderAction({}, form));
  },

  // ── CRM: файлы заказа для типографии, данные, связи, заметка, правка книги ─────────────────────────────────

  async crmOrderFiles({ staff: s, input }) {
    const staff = s!;
    const order = await visibleOrder(staff, input.orderId);
    const spec = order.printSpec;
    const canFiles = can(staff, "orders.files");
    return {
      canFiles,
      layout: await staffLayoutView(order),
      spec: spec
        ? { format: getFormat(spec.format).short, pages: spec.pageCount, spineMm: spec.spineMm, coverWidthMm: spec.coverWidthMm, coverHeightMm: spec.coverHeightMm, generatedAt: spec.generatedAt }
        : null,
      files: FILES.filter((f) => can(staff, f.perm)).map((f) => ({ kind: f.kind, label: f.label, url: `/api/orders/${order.id}/files/${f.kind}` })),
      packageUrl: canFiles ? `/api/admin/orders/${order.id}/package` : null,
      progressUrl: `/api/orders/${order.id}/render-progress`,
      bookLocked: order.book.status !== "draft",
      canLock: can(staff, "orders.edit"),
      canRegenerate: canFiles,
    };
  },

  async crmOrderDetails({ staff: s, input }) {
    const staff = s!;
    const order = await visibleOrder(staff, input.orderId);
    // Скрытые ролью контакты не показываем и не даём перезаписать маской — как на сайте (форма только при !masked).
    const contact = contactView(staff, { phone: order.contactPhone, email: order.contactEmail });
    return {
      canEdit: can(staff, "orders.edit") && !contact.masked,
      contactName: order.contactName,
      contactPhone: contact.phone ?? "",
      contactEmail: contact.email ?? "",
      deliveryMethod: (order.deliveryMethod as "pickup" | "courier" | "post" | "abroad" | null) ?? null,
      deliveryMethods: Object.entries(deliveryLabels).map(([id, label]) => ({ id, label })),
      country: order.deliveryCountry ?? null,
      city: order.city ?? null,
      address: order.address ?? null,
      postalCode: order.postalCode ?? null,
      desiredDate: order.desiredDate ?? null,
      giftNote: order.giftNote ?? null,
    };
  },

  async crmOrderDetailsUpdate({ input }) {
    const b = input.body;
    const form = new FormData();
    form.set("orderId", input.orderId);
    form.set("contactName", b.contactName);
    form.set("contactPhone", b.contactPhone);
    form.set("contactEmail", b.contactEmail);
    form.set("deliveryMethod", b.deliveryMethod ?? "");
    for (const k of ["country", "city", "address", "postalCode", "desiredDate", "giftNote"] as const) form.set(k, b[k] ?? "");
    const r = await updateOrderDetailsAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true, message: r.ok ?? "Сохранено" };
  },

  async crmOrderLinks({ staff: s, input }) {
    const staff = s!;
    const order = await visibleOrder(staff, input.orderId);
    const { deal } = await container().reporting.orderCrm(order);
    return {
      clientId: can(staff, "clients.view") ? order.userId : null,
      dealId: deal?.id ?? null,
      dealNumber: deal?.number ?? null,
      chatId: deal?.conversationId ?? null,
      bookId: order.book.id,
      adminNote: order.adminNote ?? "",
      canNote: can(staff, "orders.edit"),
      printUrl: isPrintedPlan(order.plan) ? `/print/orders/${order.id}` : null,
    };
  },

  async crmOrderNote({ input }) {
    const form = new FormData();
    form.set("orderId", input.orderId);
    form.set("adminNote", input.body.note);
    const r = await saveAdminNoteAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true as const, message: r.ok ?? "Заметка сохранена" };
  },

  async crmOrderBookLock({ input }) {
    const order = await container().ordering.queries.orderDetails(input.orderId);
    if (!order) throw new HttpError(404, "notFound");
    // Кнопка сайта переключает; здесь — нужное состояние: повтор запроса не открывает обратно.
    const locked = order.book.status !== "draft";
    if (locked !== input.body.locked) await toggleBookLockAction(order.id);
    return { ok: true, message: input.body.locked ? "Книга закрыта для правок" : "Книга открыта для правок клиентом" };
  },

  // ── CRM: «Финансы», «Расходы», «Прибыль» — модели тех же функций экранов сайта ───────────────────────────

  async crmFinance({ staff: s, input }) {
    const staff = s!;
    const { tz, period } = periodOf(input);
    const now = new Date();
    const showFlow = staff.scope === "all" && can(staff, "finance.view");
    const c = container();
    const [data, admins, profit] = await Promise.all([c.reporting.finance({ from: period.prev.from, to: period.to }), c.access.queries.allStaff(), showFlow ? loadProfit(period, tz) : null]);
    const sc = financeScreen({ period, ...data, staff: admins, visible: (id) => canWork(staff, id), viewerId: staff.context.isOwner ? null : staff.user.id, tz, now });
    const t = sc.totals;
    const reviewDeal = can(staff, "team.manage");
    const reviewOrder = can(staff, "team.manage", "orders.edit");
    const money = (m: (typeof sc.recent)[number]) => ({
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
      byDay: sc.byDay.map((d) => ({ date: d.date, incoming: d.incoming, refunds: d.refunds })),
      byMethod: sc.byMethod.filter((b) => b.value > 0),
      byManager: sc.byManager.map((m) => ({ key: m.id, label: m.label, value: m.value, count: m.count })),
      review: sc.review.map((r) => ({
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
      issues: sc.issues.map((i) => ({ key: i.key, kind: i.kind, title: i.title, href: i.href, ref: i.ref, client: i.client, manager: i.manager, amount: i.amount, note: i.note, dateLabel: i.dateLabel, target: i.target, canUpgrade: i.canUpgrade })),
      resolved: sc.resolved.map((r) => ({ id: r.id, title: r.title, ref: r.ref, client: r.client, href: r.href, amount: r.amount, note: r.note, by: r.by, dateLabel: r.dateLabel, stillOpen: r.stillOpen })),
      recent: sc.recent.slice(0, RECENT).map(money),
      refunds: sc.refunds.map(money),
      expected: {
        rows: sc.expected.rows.slice(0, EXPECTED).map((e) => ({ key: e.key, kind: e.kind, href: e.href, ref: e.ref, client: e.client, manager: e.manager, total: e.total, paid: e.paid, left: e.left, group: e.group, bookLabel: e.bookLabel, dueLabel: e.dueLabel, overdue: e.overdue, invoice: e.invoice, note: e.note })),
        groups: sc.expected.groups,
        total: t.expectedAll,
      },
      perms: { reviewDeal, reviewOrder, resolveDeal: reviewDeal, resolveOrder: reviewOrder, refundDeal: can(staff, "deals.edit"), editOrder: can(staff, "orders.edit") },
    };
  },

  async crmFinanceReview({ input }) {
    const r = input.body.kind === "deal" ? await reviewDealPaymentAction(input.body.id) : await reviewOrderPaymentAction(input.body.id);
    if (r.error) return refused(r.error);
    return message(("ok" in r && typeof r.ok === "string" && r.ok) || "Отмечено: проверено");
  },

  async crmFinanceResolve({ input }) {
    const r = await resolveFinanceIssueAction(input.body.key, input.body.amount, input.body.note);
    if (r.error) return refused(r.error);
    return message(r.ok ?? "Отмечено решённым");
  },

  async crmFinanceUndo({ input }) {
    const r = await undoFinanceResolutionAction(input.resolutionId);
    if (r.error) return refused(r.error);
    return message(r.ok ?? "Решение отменено");
  },

  async crmExpenses({ staff: s, input }) {
    const staff = s!;
    const { period } = periodOf(input);
    const c = container();
    const [rows, admins] = await Promise.all([c.reporting.expenses(period.first, period.last), c.access.queries.allStaff()]);
    const sc = expensesScreen({ period, expenses: rows, staff: admins });
    return {
      period: periodOut(period),
      total: sc.total,
      byCategory: sc.byCategory,
      byGroup: expenseGroupKeys.map((key) => {
        const list = sc.rows.filter((r) => expenseGroupOf(r.category) === key);
        return { key, label: expenseGroups[key], value: list.reduce((n, r) => n + r.amount, 0), count: list.length };
      }),
      rows: sc.rows.map((r) => ({ id: r.id, source: r.source, day: r.day, category: r.category, categoryLabel: r.label, name: r.name, title: r.title, amount: r.amount, quantity: r.quantity, note: r.note, channel: r.channel, by: r.by })),
      canManage: can(staff, "finance.manage"),
      categories: expenseCategoryKeys.map((k) => ({ id: k, label: expenseCategories[k], group: expenseGroupOf(k) })),
      channels: Object.entries(channels).map(([id, label]) => ({ id, label })),
    };
  },

  async crmExpenseAdd({ input }) {
    const b = input.body;
    const r = await addExpenseAction({ ...b, quantity: b.quantity ?? "", channel: b.channel ?? undefined });
    if (!r.ok) return refused(r.error);
    return message("Расход внесён");
  },

  async crmExpenseUpdate({ input }) {
    const b = input.body;
    const r = await updateExpenseAction(input.expenseId, { ...b, quantity: b.quantity ?? "", channel: b.channel ?? undefined });
    if (!r.ok) return refused(r.error);
    return message("Сохранено");
  },

  async crmExpenseRemove({ input }) {
    const r = await removeExpenseAction(input.expenseId, input.source);
    if (!r.ok) return refused(r.error);
    return message("Расход удалён");
  },

  async crmProfit({ staff: s, input }) {
    const staff = s!;
    const { tz, period } = periodOf(input);
    const [{ screen: sc, feeRates }, dealFields] = await Promise.all([loadProfit(period, tz), listFields("deal")]);
    const t = sc.totals;
    // Строки отчёта — как на странице «Прибыль».
    const lines: { label: string; value: number; prev: number; kind: "sum" | "sub" | "result" | null; minus: boolean }[] = [
      { label: "Пришло от клиентов", value: t.incoming, prev: t.prev.revenue, kind: "sub", minus: false },
      { label: "Возвраты клиентам", value: t.refunds, prev: 0, kind: "sub", minus: true },
      { label: "Выручка", value: t.revenue, prev: t.prev.revenue, kind: "sum", minus: false },
      ...sc.byCategory.filter((c) => c.group === "cogs").map((c) => ({ label: c.label, value: c.value, prev: c.prev, kind: "sub" as const, minus: true })),
      { label: "Валовая прибыль", value: t.gross, prev: t.prev.revenue - t.prev.cogs, kind: "sum", minus: false },
      ...expenseGroupKeys
        .filter((g) => g !== "cogs")
        .flatMap((g) => [
          { label: expenseGroups[g], value: t[g], prev: t.prev[g], kind: null, minus: true },
          ...(g === "marketing" ? [] : sc.byCategory.filter((c) => c.group === g).map((c) => ({ label: c.label, value: c.value, prev: c.prev, kind: "sub" as const, minus: true }))),
        ]),
      { label: "Прибыль", value: t.profit, prev: t.prev.profit, kind: "result", minus: false },
    ];
    const u = sc.unit;
    return {
      period: periodOut(period),
      totals: { revenue: t.revenue, expenses: t.expenses, profit: t.profit, margin: t.margin, deltaRevenue: t.delta.revenue, deltaExpenses: t.delta.expenses, deltaProfit: t.delta.profit },
      lines,
      step: sc.step,
      rows: sc.rows.map((r) => ({ key: r.key, label: r.label, revenue: r.revenue, expenses: r.expenses, profit: r.profit })),
      flow: { incoming: sc.flow.incoming, refunds: sc.flow.refunds, fees: sc.flow.fees, tax: sc.flow.tax, net: sc.flow.net, other: sc.flow.other, profit: sc.flow.profit },
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
      fees: { auto: sc.fees.auto, base: sc.fees.base, byForm: sc.fees.byForm },
      tax: { rate: sc.tax.rate, auto: sc.tax.auto },
      noExpenses: sc.noExpenses,
      canManage: can(staff, "finance.manage"),
      payForms: dealFields.find((f) => f.key === PAY_FORM_KEY)?.options ?? [...PAY_FORM_OPTIONS],
      feeRates,
    };
  },

  async crmProfitFees({ input }) {
    const r = await saveFeeRatesAction(input.body.rates, input.body.taxRate);
    if (!r.ok) return refused(r.error);
    return message("Проценты сохранены");
  },

  // ── CRM: счета сделки (те же действия, что у формы счёта в CRM на сайте) ────────────────────────────────────

  async crmInvoiceForm({ input }) {
    const r = await invoiceFormInfoAction({ dealId: input.dealId, conversationId: input.conversationId });
    return r.ok ? r.info : refused(r.message);
  },

  async crmInvoiceIssue({ input }) {
    const r = await issueInvoiceAction(input.body);
    return r.ok ? r : refused(r.message);
  },

  async crmInvoiceCancel({ input }) {
    const r = await cancelInvoiceAction(input.invoiceId);
    return r.ok ? { ok: true as const, message: r.message } : refused(r.message);
  },

  async crmInvoiceResend({ input }) {
    const r = await resendInvoiceAction(input.invoiceId);
    return r.ok ? r : refused(r.message);
  },
};

/**
 * Права маршрутов CRM — те же наборы, что apiStaff(req, …) в mybook-api и @Permissions(…) в Nest (сотруднику нужны все).
 * Оплату и возврат с чеком (crmOrderPay, crmOrderRefund) проверяет сам маршрут сайта (/api/admin/orders/<id>/…).
 * Маршруты клиента и веба — без прав сотрудника (вход клиента или открытая ссылка оплаты).
 */
export const ORDERS_API_PERMISSIONS = {
  crmOrderMoney: ["orders.view"],
  crmOrderPaymentVoid: ["orders.edit"],
  crmOrderPaymentReview: ["orders.edit"],
  crmOrderPostpay: ["orders.edit"],
  crmOrderTerms: ["orders.edit"],
  crmOrderRepriceRequest: ["orders.edit"],
  crmOrderDelivery: ["orders.edit"],
  crmOrderFiles: ["orders.view"],
  crmOrderDetails: ["orders.view"],
  crmOrderDetailsUpdate: ["orders.edit"],
  crmOrderLinks: ["orders.view"],
  crmOrderNote: ["orders.edit"],
  crmOrderBookLock: ["orders.edit"],
  crmFinance: ["analytics.view"],
  crmFinanceReview: ["analytics.view"],
  crmFinanceResolve: ["analytics.view"],
  crmFinanceUndo: ["analytics.view"],
  crmExpenses: ["finance.view"],
  crmExpenseAdd: ["finance.manage"],
  crmExpenseUpdate: ["finance.manage"],
  crmExpenseRemove: ["finance.manage"],
  crmProfit: ["finance.view"],
  crmProfitFees: ["finance.manage"],
  crmInvoiceForm: ["chats.send", "deals.edit"],
  crmInvoiceIssue: ["chats.send", "deals.edit"],
  crmInvoiceCancel: ["deals.edit"],
  crmInvoiceResend: ["chats.send", "deals.edit"],
} as const;
