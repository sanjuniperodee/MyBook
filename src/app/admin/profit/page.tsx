import Link from "next/link";
import { z } from "zod";
import { Download } from "lucide-react";
import { container } from "@/server/container";
import { can, requireStaff } from "@/server/access";
import { getSetting, listFields } from "@/modules/workspace";
import { storeTimeZone, zonedDay } from "@/shared/domain/time";
import { formatPrice } from "@/config/site";
import { StatRow, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionHead } from "@/components/admin/SectionHead";
import { PeriodBar, periodQuery } from "@/components/admin/PeriodBar";
import { Panel } from "@/components/ui/Panel";
import { Alert } from "@/components/ui/Alert";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { profitScreen } from "@/modules/reporting/ui/profit-screen";
import { expenseGroupKeys, expenseGroups, PAY_FORM_KEY, PAY_FORM_OPTIONS, parseFeeRates } from "@/shared/domain/expenses";
import { FeeSettingsButton } from "./FeeSettings";

export const metadata = { title: "Прибыль" };

const query = z.object({ p: z.string().max(10).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }).catch({});

const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";
const signed = (n: number) => (n < 0 ? `−${formatPrice(-n)}` : formatPrice(n));
const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toFixed(digits).replace(".", ",").replace("-", "−")}%`);
const times = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const STEP_LABEL = { day: "По дням", week: "По неделям", month: "По месяцам" } as const;

/**
 * «Прибыль» — отчёт о прибыли за период (DESIGN.md §7.2, «показатели → ведомость»): пришло денег минус расходы. Сверху
 * четыре цифры с изменением к прошлому периоду, затем отчёт строками (выручка → себестоимость → реклама → команда →
 * прочее → прибыль), таблица по времени и экономика продаж: стоимость заявки и покупателя, окупаемость рекламы от денег
 * и от суммы договоров, цена печати книги. Деньги — те же, что в «Финансах»; расходы — из «Расходов».
 */
export default async function ProfitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff("finance.view");
  const q = query.parse(await searchParams);
  const tz = storeTimeZone();
  const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now: new Date(), tz });
  const prev = { ...period.prev, first: zonedDay(period.prev.from, tz), last: zonedDay(new Date(period.prev.to.getTime() - 1), tz) };
  const [data, feeSetting, dealFields] = await Promise.all([container().reporting.profit({ from: period.from, to: period.to, first: period.first, last: period.last, prev }), getSetting("finance.fees"), listFields("deal")]);
  const feeRates = parseFeeRates(feeSetting);
  const s = profitScreen({ period, ...data, feeRates, tz });
  // Формы оплаты — варианты поля сделки; до миграции поля — стандартный набор.
  const payForms = dealFields.find((f) => f.key === PAY_FORM_KEY)?.options ?? [...PAY_FORM_OPTIONS];
  const { totals: t, unit: u } = s;
  const share = (v: number) => (t.revenue > 0 ? pct(v / t.revenue) : "—");
  const lines: { label: string; value: number; prev: number; kind?: "sum" | "sub" | "result"; minus?: boolean }[] = [
    { label: "Пришло от клиентов", value: t.incoming, prev: t.prev.revenue, kind: "sub" },
    { label: "Возвраты клиентам", value: t.refunds, prev: 0, kind: "sub", minus: true },
    { label: "Выручка", value: t.revenue, prev: t.prev.revenue, kind: "sum" },
    ...s.byCategory.filter((c) => c.group === "cogs").map((c) => ({ label: c.label, value: c.value, prev: c.prev, kind: "sub" as const, minus: true })),
    { label: "Валовая прибыль", value: t.gross, prev: t.prev.revenue - t.prev.cogs, kind: "sum" },
    ...expenseGroupKeys
      .filter((g) => g !== "cogs")
      .flatMap((g) => [
        { label: expenseGroups[g], value: t[g], prev: t.prev[g], minus: true },
        ...(g === "marketing" ? [] : s.byCategory.filter((c) => c.group === g).map((c) => ({ label: c.label, value: c.value, prev: c.prev, kind: "sub" as const, minus: true }))),
      ]),
    { label: "Прибыль", value: t.profit, prev: t.prev.profit, kind: "result" },
  ];
  const href = periodQuery(period);

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Прибыль"
        actions={
          <>
            {can(staff, "finance.manage") ? <FeeSettingsButton forms={payForms} rates={feeRates} /> : null}
            <a href={`/api/admin/export/profit?${href}`} className="btn btn-outline btn-sm" data-testid="profit-export">
              <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать CSV
            </a>
          </>
        }
      >
        Пришло денег минус расходы за период. Деньги — как в{" "}
        <Link href={`/admin/finance?${href}`} className="text-wine hover:underline">
          «Финансах»
        </Link>
        , расходы — из{" "}
        <Link href={`/admin/expenses?${href}`} className="text-wine hover:underline">
          «Расходов»
        </Link>
        .
      </PageHeader>

      <PeriodBar path="/admin/profit" period={period} bad={q.p === "custom" && period.preset !== "custom"} />

      {s.noExpenses ? (
        <Alert kind="warning">
          За период не внесено ни одного расхода, поэтому прибыль равна выручке.{" "}
          <Link href={`/admin/expenses?${href}`} className="font-medium underline">
            Внести расходы
          </Link>
        </Alert>
      ) : null}

      <section aria-label="Итоги периода" data-testid="profit-totals">
        <StatRow cols={4}>
          <StatTile bare label="Выручка" value={signed(t.revenue)} delta={t.delta.revenue} hint={t.refunds ? `возвраты ${formatPrice(t.refunds)} вычтены` : undefined} />
          <StatTile bare label="Расходы" value={formatPrice(t.expenses)} delta={t.delta.expenses} goodWhenUp={false} hint={t.expenseCount ? undefined : "не внесены"} />
          <StatTile bare label="Прибыль" value={signed(t.profit)} delta={t.delta.profit} />
          <StatTile bare label="Рентабельность" value={pct(t.margin)} hint={`валовая ${pct(t.grossMargin)}`} />
        </StatRow>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] xl:items-start">
        <Panel flush title="Отчёт о прибыли" description="Кассовым методом: деньги и расходы — в день, когда прошли">
          <div className="overflow-x-auto">
            <table className={cn("table min-w-[460px]", EDGE)} data-testid="profit-statement">
              <thead>
                <tr>
                  <th>Статья</th>
                  <th className="num">Сумма</th>
                  <th className="num">Доля выручки</th>
                  <th className="num max-sm:hidden">Прошлый период</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.label}-${i}`} className={cn(l.kind === "result" && "bg-sunken/60")}>
                    <td className={cn(l.kind === "sub" ? "pl-8 text-ink-soft sm:!pl-10" : "font-medium", l.kind === "result" && "font-semibold")}>{l.label}</td>
                    <td className={cn("num whitespace-nowrap", l.kind !== "sub" && "font-medium", l.kind === "result" && "font-semibold", l.kind === "result" && l.value < 0 && "text-danger")}>
                      {l.minus && l.value ? `−${formatPrice(l.value)}` : signed(l.value)}
                    </td>
                    <td className="num text-muted">{l.label === "Выручка" || l.label === "Пришло от клиентов" ? "" : share(l.value)}</td>
                    <td className="num whitespace-nowrap text-muted max-sm:hidden">{l.label === "Возвраты клиентам" ? "" : l.minus && l.prev ? `−${formatPrice(l.prev)}` : signed(l.prev)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <section aria-labelledby="unit-h" className="space-y-2">
          <SectionHead id="unit-h" title="Экономика продаж" meta="Сколько стоит заявка и покупатель" />
          <StatRow cols={2}>
            <StatTile bare label="Заявок" value={u.leads.toLocaleString("ru-RU")} hint={`в прошлом периоде ${s.prevUnit.leads}`} />
            <StatTile bare label="Новых покупателей" value={u.buyers.toLocaleString("ru-RU")} hint={`конверсия ${pct(u.conversion, 1)}`} />
            <StatTile bare label="Стоимость заявки" value={u.cpl === null ? "—" : formatPrice(u.cpl)} hint={u.cpl === null ? "внесите расходы на рекламу" : "реклама ÷ заявки"} />
            <StatTile bare label="Стоимость покупателя" value={u.cac === null ? "—" : formatPrice(u.cac)} hint={u.cac === null ? "внесите расходы на рекламу" : "реклама ÷ новые покупатели"} />
            <StatTile bare label="Окупаемость рекламы деньгами" value={times(u.roasCash)} hint={`от первых оплат новых — ${times(u.roasFirst)}`} />
            <StatTile bare label="Окупаемость по договорам" value={times(u.roasAgreed)} hint="если все допишут книгу и доплатят" />
            <StatTile bare label="Печать одной книги" value={u.printPerBook === null ? "—" : formatPrice(u.printPerBook)} hint={u.printPerBook === null ? "укажите число книг в записях о печати" : `${u.printQty} шт. за период`} />
            <StatTile bare label="Прибыль на покупателя" value={u.profitPerBuyer === null ? "—" : signed(u.profitPerBuyer)} hint={u.avgAgreed === null ? undefined : `средний договор ${formatPrice(u.avgAgreed)}`} />
          </StatRow>
        </section>
      </div>

      <Panel
        flush
        title="Комиссии по формам оплаты"
        description={
          <>
            Считаются сами с денег сделок, у которых выбрана форма оплаты (поле сделки или{" "}
            <Link href={`/admin/sales?${href}`} className="text-wine hover:underline">
              реестр продаж
            </Link>
            ). Входят в себестоимость строкой «Комиссии банка и рассрочки»
          </>
        }
      >
        {s.fees.byForm.length ? (
          <div className="overflow-x-auto">
            <table className={cn("table min-w-[520px]", EDGE)} data-testid="profit-fees">
              <thead>
                <tr>
                  <th>Форма оплаты</th>
                  <th className="num">Оплат</th>
                  <th className="num">Пришло от клиентов</th>
                  <th className="num">Комиссия</th>
                  <th className="num">Удержано</th>
                  <th className="num">На счёт</th>
                </tr>
              </thead>
              <tbody>
                {s.fees.byForm.map((f) => (
                  <tr key={f.form}>
                    <td>{f.form}</td>
                    <td className="num">{f.count}</td>
                    <td className="num whitespace-nowrap">{signed(f.money)}</td>
                    <td className="num text-muted">{f.rate ? `${String(f.rate).replace(".", ",")}%` : "—"}</td>
                    <td className="num whitespace-nowrap">{f.fee ? `−${formatPrice(f.fee)}` : "—"}</td>
                    <td className="num font-medium whitespace-nowrap">{signed(f.money - f.fee)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={2}>Итого с формой оплаты</td>
                  <td className="num whitespace-nowrap">{signed(s.fees.tagged)}</td>
                  <td />
                  <td className="num whitespace-nowrap">{s.fees.auto ? `−${formatPrice(s.fees.auto)}` : "—"}</td>
                  <td className="num whitespace-nowrap">{signed(s.fees.tagged - s.fees.auto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
        {s.fees.untagged > 0 ? (
          <p className="px-4 py-3 text-sm text-muted sm:px-5">
            Без формы оплаты — {formatPrice(s.fees.untagged)} из {formatPrice(t.revenue)}: комиссия с них не считается. Укажите форму в{" "}
            <Link href={`/admin/sales?${href}`} className="text-wine hover:underline">
              реестре продаж
            </Link>
            .
          </p>
        ) : null}
      </Panel>

      <Panel flush title={STEP_LABEL[s.step]} description="Выручка, расходы по группам и прибыль">
        <div className="overflow-x-auto">
          <table className={cn("table min-w-[760px]", EDGE)} data-testid="profit-by-time">
            <thead>
              <tr>
                <th>Период</th>
                <th className="num">Выручка</th>
                <th className="num">Себестоимость</th>
                <th className="num">Реклама</th>
                <th className="num">Команда</th>
                <th className="num">Прочее</th>
                <th className="num">Прибыль</th>
                <th className="num">Рентабельность</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.key}>
                  <td className="whitespace-nowrap">{r.label}</td>
                  <td className="num whitespace-nowrap">{r.revenue ? signed(r.revenue) : "—"}</td>
                  <td className="num whitespace-nowrap text-muted">{r.cogs ? formatPrice(r.cogs) : "—"}</td>
                  <td className="num whitespace-nowrap text-muted">{r.marketing ? formatPrice(r.marketing) : "—"}</td>
                  <td className="num whitespace-nowrap text-muted">{r.team ? formatPrice(r.team) : "—"}</td>
                  <td className="num whitespace-nowrap text-muted">{r.operating ? formatPrice(r.operating) : "—"}</td>
                  <td className={cn("num font-medium whitespace-nowrap", r.profit < 0 && "text-danger")}>{r.revenue || r.expenses ? signed(r.profit) : "—"}</td>
                  <td className="num text-muted">{r.revenue > 0 ? pct(r.profit / r.revenue) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td>Итого</td>
                <td className="num whitespace-nowrap">{signed(t.revenue)}</td>
                <td className="num whitespace-nowrap">{formatPrice(t.cogs)}</td>
                <td className="num whitespace-nowrap">{formatPrice(t.marketing)}</td>
                <td className="num whitespace-nowrap">{formatPrice(t.team)}</td>
                <td className="num whitespace-nowrap">{formatPrice(t.operating)}</td>
                <td className={cn("num whitespace-nowrap", t.profit < 0 && "text-danger")}>{signed(t.profit)}</td>
                <td className="num">{pct(t.margin)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}
