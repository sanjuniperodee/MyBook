import Link from "next/link";
import { z } from "zod";
import { Download, ScrollText } from "lucide-react";
import { can, canWork, contactView, requireStaff } from "@/server/access";
import { PAY_FORM_KEY, PAY_FORM_OPTIONS, parseFeeRates } from "@/shared/domain/expenses";
import { PayFormSelect } from "./PayFormSelect";
import { storeTimeZone } from "@/shared/domain/time";
import { formatPhone } from "@/shared/domain/phone";
import { formatPrice } from "@/config/site";
import { StatRow, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { PeriodBar, periodQuery } from "@/components/admin/PeriodBar";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { salesRegisterScreen } from "@/modules/reporting/ui/lead-stats";
import { crmRead } from "@/server/v1-local-bridge-crm";

export const metadata = { title: "Реестр продаж" };

const query = z.object({ p: z.string().max(10).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }).catch({});

const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";
const plural = (n: number, forms: [string, string, string]) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? forms[0] : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? forms[1] : forms[2]}`;
const shortDay = (d: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d);

/**
 * «Реестр продаж» — ведомость (DESIGN.md §7.2): по строке на покупателя с первой оплатой в периоде — как лист продаж в
 * таблице: когда продали, кто, откуда, кто ведёт, цена, оплачено, остаток, что с книгой. Роль «только свои» видит свои
 * сделки; телефон — по праву «Видеть телефоны полностью».
 */
export default async function SalesRegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff("analytics.view");
  const q = query.parse(await searchParams);
  const tz = storeTimeZone();
  const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now: new Date(), tz });
  const { rows, admins, feeSetting, dealFields } = await crmRead("money.sales", { p: q.p, from: q.from, to: q.to });
  // Комиссии банка видит тот, кому открыты расходы и прибыль; остальным — только форма оплаты.
  const showFees = can(staff, "finance.view");
  const s = salesRegisterScreen({ rows, staff: admins, visible: (id) => canWork(staff, id), contact: (phone) => (phone ? contactView(staff, { phone: formatPhone(phone) }).phone : ""), tz, feeRates: showFees ? parseFeeRates(feeSetting) : {} });
  const payForms = dealFields.find((f) => f.key === PAY_FORM_KEY)?.options ?? [...PAY_FORM_OPTIONS];
  const canEdit = can(staff, "deals.edit");
  const { totals: t } = s;

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Реестр продаж"
        actions={
          s.rows.length ? (
            <a href={`/api/admin/export/sales?${periodQuery(period)}`} className="btn btn-outline btn-sm" data-testid="sales-export">
              <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать CSV
            </a>
          ) : null
        }
      >
        Покупатели периода: первая оплата пришла в выбранные дни. Цена — сумма договорённости, остаток — что ещё не оплачено.
      </PageHeader>

      <PeriodBar path="/admin/sales" period={period} bad={q.p === "custom" && period.preset !== "custom"} />

      <section aria-label="Итоги продаж" data-testid="sales-totals">
        <StatRow cols={4}>
          <StatTile bare label="Продаж" value={t.count.toLocaleString("ru-RU")} hint={t.count ? `оплачены полностью: ${t.settled}` : "за период — нет"} />
          <StatTile bare label="На сумму по договорам" value={formatPrice(t.price)} hint={t.count ? `в среднем ${formatPrice(Math.round(t.price / t.count))}` : undefined} />
          <StatTile bare label="Оплачено" value={formatPrice(t.paid)} hint={t.price ? `${Math.round((t.paid / t.price) * 100)}% суммы` : undefined} />
          <StatTile bare label="Остаток к оплате" value={formatPrice(t.rest)} hint={[t.count - t.settled ? plural(t.count - t.settled, ["клиент", "клиента", "клиентов"]) : "все оплатили", showFees && t.fee ? `комиссии банка ${formatPrice(t.fee)}` : ""].filter(Boolean).join("; ")} />
        </StatRow>
      </section>

      {s.rows.length ? (
        <Panel flush title="Продажи" description={`${plural(t.count, ["покупатель", "покупателя", "покупателей"])}, свежие — первыми`}>
          <div className="hidden overflow-x-auto lg:block">
            <table className={cn("table min-w-[1260px]", EDGE)} data-testid="sales-table">
              <thead>
                <tr>
                  <th>Продажа</th>
                  <th>Сделка</th>
                  <th>Клиент</th>
                  <th>Город</th>
                  <th>Источник</th>
                  <th>Менеджер</th>
                  <th className="num">Цена</th>
                  <th className="num">Оплачено</th>
                  <th className="num">Остаток</th>
                  <th>Форма оплаты</th>
                  <th>Состояние</th>
                  <th>К дате</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-muted tabular-nums">{shortDay(r.day)}</td>
                    <td className="whitespace-nowrap">
                      <Link href={`/admin/deals/${r.id}`} className="text-wine hover:underline">
                        Д{r.number}
                      </Link>
                    </td>
                    <td>
                      {r.client || "—"}
                      {r.phone ? <span className="block text-xs whitespace-nowrap text-muted tabular-nums">{r.phone}</span> : null}
                    </td>
                    <td>{r.city || "—"}</td>
                    <td>{r.channel}</td>
                    <td>{r.manager}</td>
                    <td className="num whitespace-nowrap">{formatPrice(r.price)}</td>
                    <td className="num font-medium whitespace-nowrap">{formatPrice(r.paid)}</td>
                    <td className={cn("num whitespace-nowrap", r.rest ? "text-ink" : "text-muted")}>{r.rest ? formatPrice(r.rest) : "—"}</td>
                    <td>
                      {canEdit ? <PayFormSelect dealId={r.id} value={r.payForm} options={payForms} label={`Форма оплаты: ${r.client || `Д${r.number}`}`} /> : r.payForm || "—"}
                      {r.fee ? <span className="mt-0.5 block text-xs text-muted tabular-nums">комиссия {formatPrice(r.fee)}</span> : null}
                    </td>
                    <td>
                      {r.state}
                      {r.method ? <span className="block text-xs text-muted">{r.method}</span> : null}
                    </td>
                    <td className="whitespace-nowrap text-muted tabular-nums">{shortDay(r.eventDate) || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={6}>Итого</td>
                  <td className="num whitespace-nowrap">{formatPrice(t.price)}</td>
                  <td className="num whitespace-nowrap">{formatPrice(t.paid)}</td>
                  <td className="num whitespace-nowrap">{formatPrice(t.rest)}</td>
                  <td className="whitespace-nowrap font-normal text-muted">{t.fee ? `комиссии ${formatPrice(t.fee)}` : ""}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <ul className="divide-y divide-line lg:hidden">
            {s.rows.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/admin/deals/${r.id}`} className="min-w-0 truncate font-medium text-wine">
                    {r.client || `Сделка Д${r.number}`}
                  </Link>
                  <span className="shrink-0 font-medium tabular-nums">{formatPrice(r.paid)}</span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-muted">
                  <span className="min-w-0 truncate">
                    {shortDay(r.day)}, {r.manager}
                    {r.city ? `, ${r.city}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">{r.rest ? `остаток ${formatPrice(r.rest)}` : "оплачено"}</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  {r.state}, {r.channel}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <div className="panel">
          <EmptyState icon={ScrollText} title="За период продаж нет">
            Продажа попадает в реестр в день первой оплаты по сделке.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
