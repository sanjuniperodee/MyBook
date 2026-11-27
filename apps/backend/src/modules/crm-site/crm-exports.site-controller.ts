import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { planName } from "@/i18n/labels";
import { messagesFor } from "@/i18n/messages";
import { toCsv } from "@/lib/csv";
import { toVcard, vcardName } from "@/lib/vcard";
import { isPrintedPlan, orderStatusLabel } from "@/modules/ordering/ui/status";
import { clientFiltersFrom } from "@/modules/reporting";
import { financePeriod, financeScreen } from "@/modules/reporting/ui/finance-screen";
import { leadStatsScreen, salesRegisterScreen } from "@/modules/reporting/ui/lead-stats";
import { expensesScreen, profitScreen } from "@/modules/reporting/ui/profit-screen";
import { channelLabel, toAttribution } from "@/shared/domain/channels";
import { parseFeeRates, parseTaxRate } from "@/shared/domain/expenses";
import { formatPhone, normalizePhone } from "@/shared/domain/phone";
import { clientSegments, type ClientSegment } from "@/shared/domain/segments";
import { staffLabel } from "@/shared/domain/staff";
import { storeTimeZone, zonedDay } from "@/shared/domain/time";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { SiteRoute } from "../../core/http/site-route";
import { uuidSchema } from "./crm-site.helpers";
import { CRM_SITE_PORTS, type CrmSitePorts } from "./crm-site.tokens";

const OCCASION_LABELS = new Map<string, string>(
  Object.entries(messagesFor("ru").common.occasions).map(([key, value]) => [key, value.label]),
);

const CSV_HEADERS = (filename: string) => ({
  "Content-Type": "text/csv; charset=utf-8",
  "Content-Disposition": `attachment; filename="${filename}"`,
  "Cache-Control": "no-store",
});

function isClientSegment(value: string): value is ClientSegment {
  return Object.hasOwn(clientSegments, value);
}

/**
 * 9 маршрутов выгрузки CRM (CSV и vCard):
 * `/api/admin/export/{clients,expenses,finance,leads,orders,payments,profit,sales,vcard}`.
 */
@Controller()
export class CrmExportsSiteController {
  constructor(@Inject(CRM_SITE_PORTS) private readonly ports: CrmSitePorts) {}

  @SiteRoute("GET", "/api/admin/export/clients", { auth: "staff" })
  @Permissions("clients.view", "clients.export", "clients.contacts")
  async clients(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    await this.ports.audit(staff, "export", "clients", null, Object.fromEntries(sp));
    const rawSeg = sp.get("segment") ?? "";
    const segment: ClientSegment = isClientSegment(rawSeg) ? rawSeg : "all";
    const scopeManagerId = staff.scope === "own" ? staff.user.id : null;
    const onlyMine = sp.get("mine") === "1";
    const { rows } = await this.ports.exportClients({
      segment,
      q: sp.get("q") ?? undefined,
      tag: sp.get("tag") ?? undefined,
      channel: sp.get("ch") ?? undefined,
      sort: "new",
      limit: 50_000,
      offset: 0,
      scopeManagerId: scopeManagerId ?? (onlyMine ? staff.user.id : null),
      onlyMine,
      filters: clientFiltersFrom((k) => sp.get(k)),
    });
    const names = new Map((rows.length ? await this.ports.allStaff() : []).map((a) => [a.id, staffLabel(a)]));
    const csv = toCsv(
      [
        "Имя",
        "E-mail",
        "Телефон",
        "Теги",
        "Регистрация",
        "Последний визит",
        "Книг",
        "Лучший прогресс (ответов)",
        "Заказов",
        "LTV",
        "Последний заказ",
        "Ответственный",
        "Канал",
        "Повод",
        "Последняя книга",
      ],
      rows.map((r) => [
        r.user.name,
        r.user.email,
        r.user.phone,
        r.user.tags.join(", "),
        r.user.createdAt,
        r.user.lastSeenAt,
        r.booksCount,
        r.bestAnswered,
        r.ordersCount,
        r.ltv,
        r.lastOrderAt,
        r.user.managerId ? (names.get(r.user.managerId) ?? "") : "",
        channelLabel(toAttribution(r.user.source)),
        r.occasion ? (OCCASION_LABELS.get(r.occasion) ?? r.occasion) : "",
        r.lastBookUpdate,
      ]),
    );
    return new Response(csv, { headers: CSV_HEADERS(`clients-${new Date().toISOString().slice(0, 10)}.csv`) });
  }

  @SiteRoute("GET", "/api/admin/export/expenses", { auth: "staff" })
  @Permissions("finance.view")
  async expenses(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const period = financePeriod({
      preset: sp.get("p") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      now: new Date(),
      tz: storeTimeZone(),
    });
    const [rows, admins] = await Promise.all([
      this.ports.exportExpenses(period.first, period.last),
      this.ports.allStaff(),
    ]);
    const s = expensesScreen({ period, expenses: rows, staff: admins });
    await this.ports.audit(staff, "export", "expenses", null, { first: period.first, last: period.last, rows: s.rows.length });
    const csv = toCsv(
      ["День", "Категория", "Что", "Сумма, ₸", "Количество", "Заметка", "Внёс"],
      s.rows.map((r) => [r.day, r.label, r.name, r.amount, r.quantity ?? "", r.note, r.by]),
    );
    return new Response(csv, { headers: CSV_HEADERS(`expenses-${period.first}_${period.last}.csv`) });
  }

  @SiteRoute("GET", "/api/admin/export/finance", { auth: "staff" })
  @Permissions("analytics.view")
  async finance(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const tz = storeTimeZone();
    const now = new Date();
    const period = financePeriod({
      preset: sp.get("p") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      now,
      tz,
    });
    const [data, admins] = await Promise.all([
      this.ports.exportFinance({ from: period.prev.from, to: period.to }),
      this.ports.allStaff(),
    ]);
    const s = financeScreen({ period, ...data, staff: admins, visible: (id) => staff.context.canWork(id), tz, now });
    await this.ports.audit(staff, "export", "finance", null, { first: period.first, last: period.last, rows: s.recent.length });
    const csv = toCsv(
      ["День", "Сумма, ₸", "Способ", "Что", "Сделка / заказ", "Клиент", "Ответственный", "Принял", "Операция", "Проверено"],
      s.recent.map((r) => [
        r.day,
        r.amount,
        r.method,
        r.what,
        r.refs.map((x) => x.label).join(", "),
        r.client,
        r.manager,
        r.acceptedBy,
        r.operation ?? "",
        r.check === "reviewed" ? "да" : r.check === "pending" ? "нет" : "",
      ]),
    );
    return new Response(csv, { headers: CSV_HEADERS(`finance-${period.first}_${period.last}.csv`) });
  }

  @SiteRoute("GET", "/api/admin/export/leads", { auth: "staff" })
  @Permissions("analytics.view")
  async leads(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const tz = storeTimeZone();
    const now = new Date();
    const period = financePeriod({
      preset: sp.get("p") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      now,
      tz,
    });
    const [data, admins] = await Promise.all([
      this.ports.exportLeadStats({ from: period.prev.from, to: period.to, first: period.first, last: period.last }),
      this.ports.allStaff(),
    ]);
    const m = uuidSchema.safeParse(sp.get("m"));
    const managerId = m.success && admins.some((a) => a.id === m.data && staff.context.canWork(a.id)) ? m.data : null;
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
    await this.ports.audit(staff, "export", "leads", null, { first: period.first, last: period.last, managerId });
    const share = (v: number | null) => (v === null ? "" : String(Math.round(v * 1000) / 10).replace(".", ","));
    const head = ["День", "Заявки", "Нецелевые", "Счета", "Оплаты", "Конверсия, %", "Первые оплаты, ₸", "По договорам, ₸", "Средний договор, ₸"];
    const csv = toCsv(
      showSpend ? [...head, "Реклама, ₸", "Заявка, ₸", "Покупатель, ₸", "Доля рекламы, %"] : head,
      s.daily.map((d) => {
        const row = [d.day, d.leads, d.junk, d.invoices, d.payments, share(d.conversion), d.first, d.agreed, d.avgCheck ?? ""];
        return showSpend ? [...row, d.spend, d.cpl ?? "", d.cac ?? "", share(d.adShare)] : row;
      }),
    );
    return new Response(csv, { headers: CSV_HEADERS(`leads-${period.first}_${period.last}.csv`) });
  }

  @SiteRoute("GET", "/api/admin/export/orders", { auth: "staff" })
  @Permissions("orders.view", "clients.export", "clients.contacts")
  async orders(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const params = Object.fromEntries(new URL(req.url, "http://localhost").searchParams);
    await this.ports.audit(staff, "export", "orders", null, params);
    const rows = await this.ports.exportOrders(params, { userId: staff.user.id, seesAll: staff.scope === "all" });
    const csv = toCsv(
      [
        "Номер",
        "Создан",
        "Оплачен",
        "Статус",
        "Тариф",
        "Кол-во",
        "Книги",
        "Скидка",
        "Промокод",
        "Доставка",
        "Итого",
        "Валюта",
        "Имя",
        "Телефон",
        "E-mail",
        "Способ доставки",
        "Страна",
        "Город",
        "Адрес",
        "Индекс",
        "Нужна к",
        "Трек-номер",
        "Комментарий",
      ],
      rows.map((o) => [
        o.number,
        o.createdAt,
        o.paidAt,
        orderStatusLabel(o.status, "ru", isPrintedPlan(o.plan)),
        planName(o.plan),
        o.quantity,
        o.itemsAmount,
        o.discountAmount,
        o.promoCode,
        o.deliveryAmount,
        o.amount,
        o.currency,
        o.contactName,
        o.contactPhone,
        o.contactEmail,
        o.deliveryMethod,
        o.deliveryCountry,
        o.city,
        o.address,
        o.postalCode,
        o.desiredDate,
        o.trackingNumber,
        o.customerComment,
      ]),
    );
    return new Response(csv, { headers: CSV_HEADERS(`orders-${new Date().toISOString().slice(0, 10)}.csv`) });
  }

  @SiteRoute("GET", "/api/admin/export/payments", { auth: "staff" })
  @Permissions("analytics.view")
  async payments(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const days = Math.min(3650, Math.max(1, Number(sp.get("days")) || 90));
    await this.ports.audit(staff, "export", "payments", null, { days });
    const rows = await this.ports.exportPayments(days, { userId: staff.user.id, seesAll: staff.scope === "all" });
    const csv = toCsv(
      ["Дата оплаты", "Сумма, ₸", "Откуда", "Тип", "Заказ / сделка", "Клиент", "Телефон", "Менеджер", "Чек приложен"],
      rows.map((r) => [
        r.at,
        r.amount,
        r.kind === "order"
          ? "заказ на сайте"
          : r.kind === "payment"
            ? "платёж менеджеру"
            : r.kind === "refund"
              ? "возврат клиенту"
              : "успешная сделка без платежа (сумма договорённости, денег в журнале нет)",
        r.type,
        r.ref,
        r.client,
        staff.context.contacts({ phone: r.phone }).phone,
        r.manager,
        r.receipt,
      ]),
    );
    return new Response(csv, { headers: CSV_HEADERS(`payments-${new Date().toISOString().slice(0, 10)}.csv`) });
  }

  @SiteRoute("GET", "/api/admin/export/profit", { auth: "staff" })
  @Permissions("finance.view")
  async profit(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const tz = storeTimeZone();
    const period = financePeriod({
      preset: sp.get("p") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      now: new Date(),
      tz,
    });
    const prev = {
      ...period.prev,
      first: zonedDay(period.prev.from, tz),
      last: zonedDay(new Date(period.prev.to.getTime() - 1), tz),
    };
    const data = await this.ports.exportProfit({ from: period.from, to: period.to, first: period.first, last: period.last, prev });
    const s = profitScreen({
      period,
      ...data,
      feeRates: parseFeeRates(await this.ports.getSetting("finance.fees")),
      taxRate: parseTaxRate(await this.ports.getSetting("finance.taxRate")),
      tz,
    });
    await this.ports.audit(staff, "export", "profit", null, { first: period.first, last: period.last });
    const t = s.totals;
    const csv = toCsv(
      ["Период", "Выручка, ₸", "Себестоимость, ₸", "Реклама, ₸", "Команда, ₸", "Прочее, ₸", "Расходы всего, ₸", "Прибыль, ₸"],
      [
        ...s.rows.map((r) => [r.label, r.revenue, r.cogs, r.marketing, r.team, r.operating, r.expenses, r.profit]),
        ["Итого", t.revenue, t.cogs, t.marketing, t.team, t.operating, t.expenses, t.profit],
      ],
    );
    return new Response(csv, { headers: CSV_HEADERS(`profit-${period.first}_${period.last}.csv`) });
  }

  @SiteRoute("GET", "/api/admin/export/sales", { auth: "staff" })
  @Permissions("analytics.view")
  async sales(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const tz = storeTimeZone();
    const period = financePeriod({
      preset: sp.get("p") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      now: new Date(),
      tz,
    });
    const [rows, admins] = await Promise.all([
      this.ports.exportSalesRegister({ from: period.from, to: period.to }),
      this.ports.allStaff(),
    ]);
    const showFees = staff.context.can("finance.view");
    const s = salesRegisterScreen({
      rows,
      staff: admins,
      visible: (id) => staff.context.canWork(id),
      contact: (phone) => (phone ? staff.context.contacts({ phone: formatPhone(phone) }).phone : ""),
      tz,
      feeRates: showFees ? parseFeeRates(await this.ports.getSetting("finance.fees")) : {},
    });
    await this.ports.audit(staff, "export", "sales", null, { first: period.first, last: period.last, rows: s.rows.length });
    const csv = toCsv(
      [
        "Дата продажи",
        "Сделка",
        "Дата заявки",
        "Клиент",
        "Телефон",
        "Город",
        "Источник",
        "Менеджер",
        "Тариф",
        "Книг",
        "Кому",
        "К дате",
        "Цена, ₸",
        "Оплачено, ₸",
        "Остаток, ₸",
        "Форма оплаты",
        ...(showFees ? ["Комиссия банка, ₸", "На счёт, ₸"] : []),
        "Состояние",
        "Этап",
        "Способ оплаты",
        "Заказ",
      ],
      s.rows.map((r) => [
        r.day,
        `Д${r.number}`,
        r.createdDay,
        r.client,
        r.phone,
        r.city,
        r.channel,
        r.manager,
        r.plan,
        r.quantity,
        r.recipient,
        r.eventDate,
        r.price,
        r.paid,
        r.rest,
        r.payForm,
        ...(showFees ? [r.fee, r.net] : []),
        r.state,
        r.stage,
        r.method,
        r.orderNumber ? `№${r.orderNumber}` : "",
      ]),
    );
    return new Response(csv, { headers: CSV_HEADERS(`sales-${period.first}_${period.last}.csv`) });
  }

  @SiteRoute("GET", "/api/admin/export/vcard", { auth: "staff" })
  @Permissions("clients.view", "clients.export", "clients.contacts")
  async vcard(@CurrentStaff() staff: StaffMember, @Req() req: FastifyRequest): Promise<Response> {
    const sp = new URL(req.url, "http://localhost").searchParams;
    const sinceRaw = sp.get("since");
    const since = sinceRaw && /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? new Date(`${sinceRaw}T00:00:00+05:00`) : null;
    const rows = await this.ports.exportVcard({
      since,
      scopeManagerId: staff.scope === "own" ? staff.user.id : null,
    });
    const vcf = toVcard(
      rows.map((r) => {
        const phone = normalizePhone(r.phone);
        return {
          name: vcardName({
            name: r.name,
            dealNumber: r.deal_number,
            occasion: r.occasion ? (OCCASION_LABELS.get(r.occasion) ?? r.occasion) : null,
            phone,
          }),
          phones: [...new Set([phone, ...(r.extra_phones ?? []).map(normalizePhone)].filter((p) => p.length >= 10))],
          note: "MyBooks CRM",
        };
      }),
    );
    await this.ports.audit(staff, "export", "clients_vcard", null, { since: sinceRaw, count: rows.length });
    return new Response(vcf, {
      headers: {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="mybooks-clients-${new Date().toISOString().slice(0, 10)}.vcf"`,
        "Cache-Control": "no-store",
      },
    });
  }
}
