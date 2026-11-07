import { planName } from "@/i18n/labels";
import { Download } from "lucide-react";
import { container } from "@/server/container";
import { ORDER_STATUSES as orderStatuses } from "@/shared/domain/orders";
import { contactView, requireStaff, staffViewer } from "@/server/access";
import { formatPrice, getPlans } from "@/config/site";
import { isPrintedPlan, orderStatusDot, orderStatusLabel } from "@/modules/ordering/ui/status";
import { orderMoney } from "@/modules/ordering/ui/money";
import { staffLabel } from "@/shared/domain/staff";
import { storeTimeZone } from "@/shared/domain/time";
import type { OrderFilters } from "@/modules/reporting";
import { iso, localDay } from "@/modules/reporting/time";
import { PageHeader } from "@/components/admin/PageHeader";
import { OrdersViews } from "../OrdersViews";
import { OrdersTable, type OrderDue, type OrderRow } from "../OrdersTable";
import { OrdersToolbar, type StatusChip } from "../OrdersToolbar";

export const metadata = { title: "Заказы" };
const PAGE = 50;

const MS_DAY = 86_400_000;

/** «20 дек» — день без года, если он в этом; иначе с годом. День — строка YYYY-MM-DD (без часового пояса). */
function shortDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" }).format(d).replace(/\.$/, "");
}

/** «27 окт, 09:00» по времени магазина. */
function createdShort(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: storeTimeZone() }).format(d).replace(".,", ",");
}

/**
 * Ведомость заказов (DESIGN.md §7.2): статус — чипами с числами, поиск, тариф, менеджер и даты — одной панелью над таблицей
 * (применяются сразу), быстрый период и вид «Список · Производство» — рядом; таблица с выбором и массовой сменой статуса на
 * ноутбуке, карточки на телефоне; в подвале — сколько найдено, сколько получено и страницы.
 */
export default async function AdminOrders({ searchParams }: { searchParams: Promise<OrderFilters & { page?: string }> }) {
  const staff = await requireStaff("orders.view");
  const params = await searchParams;
  const p = Math.max(1, Number(params.page) || 1);
  const viewer = staffViewer(staff);
  const reporting = container().reporting;
  // Числа на чипах — по тем же фильтрам, но без выбранного статуса (иначе у остальных чипов стояли бы нули).
  const [{ list, n, sum }, admins, counts] = await Promise.all([
    reporting.orderList(params, viewer, p, PAGE),
    container().access.queries.allStaff(),
    Promise.all(orderStatuses.map((s) => reporting.orderList({ ...params, status: s }, viewer, 1, 1).then((r) => r.n))),
  ]);
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));
  const today = localDay(0).getTime();
  const rows: OrderRow[] = list.map((o) => {
    const contact = contactView(staff, { phone: o.contactPhone, email: o.contactEmail });
    const money = orderMoney(o);
    const printed = isPrintedPlan(o.plan);
    // Срок грозит, пока заказ не закрыт; у электронной версии — только пока ждёт оплаты.
    const open = o.status !== "delivered" && o.status !== "cancelled" && (printed || o.status === "pending_payment");
    let due: OrderDue | null = null;
    if (o.desiredDate) {
      const left = Math.round((new Date(`${o.desiredDate}T00:00:00`).getTime() - today) / MS_DAY);
      due = {
        label: shortDay(o.desiredDate),
        text: !open ? null : left < 0 ? `просрочено на ${-left} дн.` : left === 0 ? "сегодня" : `через ${left} дн.`,
        tone: !open ? "neutral" : left < 0 ? "danger" : left <= 3 ? "warning" : "neutral",
      };
    }
    return {
      id: o.id,
      number: o.number,
      createdLabel: createdShort(o.createdAt),
      contactName: o.contactName,
      contactLine: [contact.phone, contact.email].filter(Boolean).join(" · "),
      planLabel: `${planName(o.plan)}${o.quantity > 1 ? ` × ${o.quantity}` : ""}`,
      printed,
      desiredLabel: o.desiredDate ? shortDay(o.desiredDate) : null,
      due,
      amountLabel: formatPrice(money.price),
      money: money.debt > 0 ? { kind: "debt", label: `долг ${formatPrice(money.debt)}` } : money.paid > 0 ? { kind: "paid", label: `оплачено ${formatPrice(money.paid)}` } : null,
      status: o.status,
      claimed: o.status === "pending_payment" && !!o.paymentClaimedAt,
      assignee: o.assigneeId ? (names.get(o.assigneeId) ?? null) : null,
      promoCode: o.promoCode,
    };
  });

  const qs = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== "page") as [string, string][]);
  /** Адрес с теми же фильтрами, но с заменой отдельных (пусто — убрать); страница сбрасывается. */
  const link = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/admin/orders${q.size ? `?${q}` : ""}`;
  };
  const pageLink = (page: number) => `?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(page) })}`;
  const pages = Math.ceil(n / PAGE);
  // Фильтры, кроме статуса (он — чипами): от них зависит подсветка «Фильтры» на телефоне и «Сбросить».
  const narrowed = [...qs.keys()].some((k) => k !== "status");

  const total = counts.reduce((a, b) => a + b, 0);
  const chips: StatusChip[] = [
    { key: "", label: "Все", href: link({ status: null }), count: total, active: !params.status, dot: null },
    ...orderStatuses.map((s, i) => ({ key: s, label: orderStatusLabel(s), href: link({ status: s }), count: counts[i], active: params.status === s, dot: orderStatusDot[s] })),
  ];

  const d7 = iso(localDay(-6));
  const d30 = iso(localDay(-29));
  const periods = [
    { key: "all", label: "Всё время", href: link({ from: null, to: null }), active: !params.from && !params.to },
    { key: "7", label: "7 дней", href: link({ from: d7, to: null }), active: params.from === d7 && !params.to },
    { key: "30", label: "30 дней", href: link({ from: d30, to: null }), active: params.from === d30 && !params.to },
  ];

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        title="Заказы"
        actions={
          <>
            <OrdersViews active="list" className="lg:hidden" />
            <a href={`/api/admin/export/orders?${qs}`} className="btn btn-outline btn-sm max-lg:hidden">
              <Download className="size-4" aria-hidden /> Выгрузить CSV
            </a>
          </>
        }
      />

      {/* Ведомость одним листом на ноутбуке (инструменты, таблица, подвал); на телефоне — инструменты над листом карточек. */}
      <div className="flex flex-col gap-3 lg:gap-0 lg:overflow-clip lg:rounded-[var(--r-panel)] lg:border lg:border-line lg:bg-white">
        <OrdersToolbar
          values={{ q: params.q ?? "", plan: params.plan ?? "", assignee: params.assignee ?? "", from: params.from ?? "", to: params.to ?? "", status: params.status ?? "" }}
          plans={getPlans().map((pl) => ({ id: pl.id, label: planName(pl.id) }))}
          admins={admins.map((a) => ({ id: a.id, label: staffLabel(a) }))}
          chips={chips}
          periods={periods}
          narrowed={narrowed}
          resetHref={link({ q: null, plan: null, assignee: null, from: null, to: null })}
        />
        <OrdersTable
          rows={rows}
          filtered={!!qs.size}
          footer={{
            count: n,
            received: formatPrice(sum),
            from: (p - 1) * PAGE + 1,
            to: Math.min(p * PAGE, n),
            page: p,
            pages,
            prevHref: p > 1 ? pageLink(p - 1) : null,
            nextHref: p < pages ? pageLink(p + 1) : null,
          }}
        />
      </div>
    </div>
  );
}
