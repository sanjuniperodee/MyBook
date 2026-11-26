import Link from "next/link";
import { z } from "zod";
import { Download, Users } from "lucide-react";
import { can, canWork, requireStaff } from "@/web/access";
import { storeTimeZone } from "@/shared/domain/time";
import { formatPrice } from "@/config/site";
import { StatRow, StatTile } from "@/components/admin/charts";
import { BarCell, DayBars } from "@/components/admin/bars";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { SectionHead } from "@/components/admin/SectionHead";
import { PeriodBar, periodQuery } from "@/components/admin/PeriodBar";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { leadStatsScreen } from "@/modules/reporting/ui/lead-stats";
import { crmRead } from "@/web/crm";

export const metadata = { title: "Статистика лидов" };

const query = z.object({ p: z.string().max(10).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional(), m: z.string().uuid().optional() }).catch({});

const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";
const pct = (v: number | null, digits = 1) => (v === null ? "—" : `${(v * 100).toFixed(digits).replace(".", ",")}%`);
const times = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const money = (v: number | null) => (v === null ? "—" : formatPrice(v));
const num = (n: number) => (n ? n.toLocaleString("ru-RU") : "—");
const shortDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const hours = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.max(Math.round(h * 60), 1)} мин` : h < 48 ? `${Math.round(h)} ч` : `${Math.round(h / 24)} дн`);

interface CutRow {
  key?: string;
  label: string;
  leads: number;
  paid: number;
  conversion: number | null;
}

/** Разрез заявок: сколько пришло, сколько оплатили, конверсия; полоса — доля от самой большой строки. */
function CutTable({ rows, first, testId }: { rows: CutRow[]; first: string; testId?: string }) {
  const max = Math.max(...rows.map((r) => r.leads), 1);
  return (
    <table className={cn("table", EDGE)} data-testid={testId}>
      <thead>
        <tr>
          <th>{first}</th>
          <th className="w-[34%]">Заявок</th>
          <th className="num">Оплатили</th>
          <th className="num">Конверсия</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key ?? r.label}>
            <td>{r.label}</td>
            <td>
              <BarCell value={r.leads} max={max} align="left">
                {r.leads}
              </BarCell>
            </td>
            <td className="num">{num(r.paid)}</td>
            <td className="num font-medium">{pct(r.conversion)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * «Статистика лидов» — сводный отчёт по заявкам, как в amoCRM: сколько пришло, сколько оплатили и где остальные; таблица
 * по дням с рекламой (как РНП и таблица маркетинга, только окупаемость — от денег); разрезы по источникам, менеджерам,
 * этапам, причинам отказа, получателю книги, поводу, сроку до события, дню недели и времени суток.
 * Роль «только свои» видит свои сделки и не видит расход на рекламу. Фильтр — один менеджер (m).
 */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaff("analytics.view");
  const q = query.parse(await searchParams);
  const tz = storeTimeZone();
  const now = new Date();
  const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now, tz });
  const { data, admins } = await crmRead("money.leads", { p: q.p, from: q.from, to: q.to });
  const all = staff.scope === "all";
  const managers = admins.filter((a) => canWork(staff, a.id) && data.deals.some((d) => d.assigneeId === a.id));
  const managerId = q.m && managers.some((m) => m.id === q.m) ? q.m : null;
  const showSpend = all && can(staff, "finance.view");
  const s = leadStatsScreen({ period, ...data, staff: admins, visible: (id) => canWork(staff, id), showSpend, managerId, tz, now });
  const t = s.totals;
  const extra = { m: managerId ?? undefined };
  const hasSpend = showSpend && t.spend > 0;

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <PageHeader
        title="Статистика лидов"
        actions={
          <a href={`/api/admin/export/leads?${periodQuery(period, extra)}`} className="btn btn-outline btn-sm" data-testid="leads-export">
            <Download className="size-4" strokeWidth={1.8} aria-hidden /> Скачать CSV
          </a>
        }
      >
        Сколько заявок пришло, сколько из них оплатили и на каком шаге остальные. Заявка — сделка, созданная в периоде; оплата в таблице по дням стоит в день денег.
      </PageHeader>

      <div className="space-y-2">
        <PeriodBar path="/admin/leads" period={period} extra={extra} bad={q.p === "custom" && period.preset !== "custom"} />
        {managers.length > 1 ? (
          <nav aria-label="Менеджер" className="flex flex-wrap gap-1.5">
            <Link href={`/admin/leads?${periodQuery(period)}`} className="chip" aria-pressed={!managerId}>
              Все
            </Link>
            {managers.map((m) => (
              <Link key={m.id} href={`/admin/leads?${periodQuery(period, { m: m.id })}`} className="chip" aria-pressed={managerId === m.id}>
                {m.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <section aria-label="Итоги" className="space-y-3" data-testid="leads-totals">
        <StatRow cols={5} className="max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:max-xl:[&>*:last-child]:col-span-2">
          <StatTile bare label="Заявок" value={t.leads.toLocaleString("ru-RU")} delta={t.delta.leads} hint={t.junk ? `ещё нецелевых ${t.junk}` : undefined} />
          <StatTile bare label="Оплатили из них" value={t.paid.toLocaleString("ru-RU")} hint={`в работе ${t.open}, отказ ${t.lost}`} />
          <StatTile bare label="Конверсия в оплату" value={pct(t.conversion)} delta={t.delta.conversion} />
          <StatTile bare label="Средний договор" value={money(t.avgCheck)} hint={t.payments ? `оплат за период ${t.payments}` : undefined} />
          <StatTile bare label="От заявки до оплаты" value={hours(t.medianHours)} hint="половина платит быстрее" />
        </StatRow>
        {hasSpend ? (
          <StatRow cols={5} className="max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:max-xl:[&>*:last-child]:col-span-2">
            <StatTile bare label="Реклама" value={formatPrice(t.spend)} hint="расходы по каналам" />
            <StatTile bare label="Стоимость заявки" value={money(t.cpl)} hint="реклама ÷ заявки" />
            <StatTile bare label="Стоимость покупателя" value={money(t.cac)} hint="реклама ÷ оплаты" />
            <StatTile bare label="Окупаемость деньгами" value={times(t.roas)} hint={`первые оплаты ${formatPrice(t.paymentsFirst)}`} />
            <StatTile bare label="Окупаемость по договорам" value={times(t.roasAgreed)} hint="если все доплатят" />
          </StatRow>
        ) : null}
      </section>

      {t.leads || t.payments ? (
        <>
          <Panel title="Заявки по дням" description={`Всего ${t.leads}, в прошлом периоде ${t.prev.leads}`}>
            <DayBars data={s.daily.map((d) => ({ key: d.day, label: shortDay(d.day), value: d.leads, note: d.payments ? `оплат ${d.payments}` : undefined }))} height={120} />
          </Panel>

          {hasSpend ? (
            <Panel flush title="Маркетинг по дням" description="Как таблица маркетинга: дни в столбцах. ДРР и ROAS — от суммы договоров и отдельно от реально пришедших денег">
              <div className="overflow-x-auto">
                <table className={cn("table min-w-max [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-[1] [&_td:first-child]:bg-white [&_tr>*:nth-child(2)]:bg-sunken/60 [&_tr>*:nth-child(2)]:font-semibold", EDGE)} data-testid="leads-marketing">
                  <thead>
                    <tr>
                      <th>Показатель</th>
                      <th className="num">Итого</th>
                      {s.daily.map((d) => (
                        <th key={d.day} className="num">
                          {shortDay(d.day)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Лиды", num(t.leads + t.junk), (d) => num(d.leads)],
                        ["Продажи", num(t.payments), (d) => num(d.payments)],
                        ["Конверсия", t.leads + t.junk ? pct(t.payments / (t.leads + t.junk), 2) : "—", (d) => (d.leads ? pct(d.conversion, 2) : "—")],
                        ["Затраты на рекламу", formatPrice(t.spend), (d) => (d.spend ? formatPrice(d.spend) : "—")],
                        ["CPL — стоимость лида", money(t.spend && t.leads + t.junk ? Math.round(t.spend / (t.leads + t.junk)) : null), (d) => money(d.cpl)],
                        ["Продажи по договорам", formatPrice(t.paymentsAgreed), (d) => (d.agreed ? formatPrice(d.agreed) : "—")],
                        ["ДРР от договоров", t.adShareAgreed === null ? "—" : pct(t.adShareAgreed, 2), (d) => (d.adShareAgreed === null ? "—" : pct(d.adShareAgreed, 2))],
                        ["CAC — стоимость покупателя", money(t.cac), (d) => money(d.cac)],
                        ["ROAS от договоров", times(t.roasAgreed), (d) => times(d.roasAgreed)],
                        ["Пришло первых оплат", formatPrice(t.paymentsFirst), (d) => (d.first ? formatPrice(d.first) : "—")],
                        ["ROAS от пришедших денег", times(t.roas), (d) => times(d.roas)],
                      ] as [string, string, (d: (typeof s.daily)[number]) => string][]
                    ).map(([label, total, cell]) => (
                      <tr key={label}>
                        <td className="font-medium">{label}</td>
                        <td className="num">{total}</td>
                        {s.daily.map((d) => (
                          <td key={d.day} className="num">
                            {cell(d)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}

          <Panel flush title="По дням" description="Как в таблице РНП: заявки и оплаты дня; конверсия дня — оплаты ÷ заявки">
            <div className="overflow-x-auto">
              <table className={cn("table", hasSpend ? "min-w-[1080px]" : "min-w-[720px]", EDGE)} data-testid="leads-daily">
                <thead>
                  <tr>
                    <th>День</th>
                    <th className="num">Заявки</th>
                    <th className="num">Нецелевые</th>
                    <th className="num">Счета</th>
                    <th className="num">Оплаты</th>
                    <th className="num">Конверсия</th>
                    <th className="num">Первые оплаты</th>
                    <th className="num">По договорам</th>
                    <th className="num">Средний договор</th>
                    {hasSpend ? (
                      <>
                        <th className="num">Реклама</th>
                        <th className="num">Заявка</th>
                        <th className="num">Покупатель</th>
                        <th className="num" title="Реклама ÷ первые оплаты дня">
                          Доля рекламы
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {[...s.daily].reverse().map((d) => (
                    <tr key={d.day}>
                      <td className="whitespace-nowrap tabular-nums">{shortDay(d.day)}</td>
                      <td className="num">{num(d.leads)}</td>
                      <td className="num text-muted">{num(d.junk)}</td>
                      <td className="num text-muted">{num(d.invoices)}</td>
                      <td className="num font-medium">{num(d.payments)}</td>
                      <td className="num">{d.leads ? pct(d.conversion) : "—"}</td>
                      <td className="num whitespace-nowrap">{d.first ? formatPrice(d.first) : "—"}</td>
                      <td className="num whitespace-nowrap text-muted">{d.agreed ? formatPrice(d.agreed) : "—"}</td>
                      <td className="num whitespace-nowrap text-muted">{money(d.avgCheck)}</td>
                      {hasSpend ? (
                        <>
                          <td className="num whitespace-nowrap">{d.spend ? formatPrice(d.spend) : "—"}</td>
                          <td className="num whitespace-nowrap text-muted">{money(d.cpl)}</td>
                          <td className="num whitespace-nowrap text-muted">{money(d.cac)}</td>
                          <td className={cn("num", d.adShare !== null && d.adShare > 1 && "font-medium text-danger")}>{d.adShare === null ? "—" : pct(d.adShare, 0)}</td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td>Итого</td>
                    <td className="num">{t.leads + t.junk}</td>
                    <td className="num">{num(t.junk)}</td>
                    <td className="num">{num(t.invoices)}</td>
                    <td className="num">{num(t.payments)}</td>
                    <td className="num">{t.leads ? pct(t.payments / (t.leads + t.junk)) : "—"}</td>
                    <td className="num whitespace-nowrap">{formatPrice(t.paymentsFirst)}</td>
                    <td className="num whitespace-nowrap">{formatPrice(t.paymentsAgreed)}</td>
                    <td className="num whitespace-nowrap">{t.payments ? formatPrice(Math.round(t.paymentsAgreed / t.payments)) : "—"}</td>
                    {hasSpend ? (
                      <>
                        <td className="num whitespace-nowrap">{formatPrice(t.spend)}</td>
                        <td className="num whitespace-nowrap">{money(t.cpl)}</td>
                        <td className="num whitespace-nowrap">{money(t.cac)}</td>
                        <td className="num">{t.adShare === null ? "—" : pct(t.adShare, 0)}</td>
                      </>
                    ) : null}
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          <section aria-labelledby="who-h" className="space-y-2">
            <SectionHead id="who-h" title="Откуда и у кого" meta="Конверсия — оплатили из заявок периода" />
            <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
              <Panel flush title="Как обратились" description="Откуда клиент написал или позвонил">
                <div className="overflow-x-auto">
                  <CutTable rows={s.bySource} first="Канал" testId="leads-sources" />
                </div>
              </Panel>
              <Panel flush title="Менеджеры" description="По ответственному сделки; заявки с телефона магазина числятся на том, у кого телефон">
                <div className="overflow-x-auto">
                  <CutTable rows={s.byManager} first="Сотрудник" testId="leads-managers" />
                </div>
              </Panel>
              {s.buyersBySource.length ? (
                <Panel flush title="Откуда покупатели" description="Рекламный канал: по меткам ссылки или выбору менеджера в сделке" className="xl:col-span-2">
                  <div className="overflow-x-auto">
                    <table className={cn("table", EDGE)} data-testid="leads-buyer-sources">
                      <thead>
                        <tr>
                          <th>Источник</th>
                          <th className="w-[30%]">Покупателей</th>
                          <th className="num">Доля</th>
                          <th className="num">По договорам</th>
                          <th className="num">Пришло денег</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.buyersBySource.map((r) => (
                          <tr key={r.key}>
                            <td>{r.label}</td>
                            <td>
                              <BarCell value={r.buyers} max={Math.max(...s.buyersBySource.map((x) => x.buyers), 1)} align="left">
                                {r.buyers}
                              </BarCell>
                            </td>
                            <td className="num">{pct(r.share, 0)}</td>
                            <td className="num whitespace-nowrap">{formatPrice(r.agreed)}</td>
                            <td className="num whitespace-nowrap font-medium">{formatPrice(r.received)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="what-h" className="space-y-2">
            <SectionHead id="what-h" title="Кому и когда дарят" meta={`Поля сделки заполнены у ${s.recipientKnown} из ${t.leads} заявок`} />
            <div className="grid gap-5 lg:grid-cols-2 lg:items-start min-[1700px]:grid-cols-3">
              <Panel flush title="Кому книга">
                {s.byRecipient.length ? (
                  <div className="overflow-x-auto">
                    <CutTable rows={s.byRecipient} first="Получатель" testId="leads-recipients" />
                  </div>
                ) : (
                  <EmptyState compact title="Поле «Кому книга» не заполнено">
                    Заполняйте его в сделке — отчёт покажет, какие клиенты покупают чаще.
                  </EmptyState>
                )}
              </Panel>
              <Panel flush title="Повод">
                {s.byOccasion.length ? (
                  <div className="overflow-x-auto">
                    <CutTable rows={s.byOccasion} first="Повод" />
                  </div>
                ) : (
                  <EmptyState compact title="Повод в сделках не указан" />
                )}
              </Panel>
              <Panel flush title="До события" description="От заявки до даты подарка">
                {s.byLeadTime.length ? (
                  <div className="overflow-x-auto">
                    <CutTable rows={s.byLeadTime} first="Срок" />
                  </div>
                ) : (
                  <EmptyState compact title="Дата события в сделках не указана" />
                )}
              </Panel>
            </div>
          </section>

          <section aria-labelledby="where-h" className="space-y-2">
            <SectionHead id="where-h" title="Где заявки сейчас" />
            <div className="grid gap-5 lg:grid-cols-2 lg:items-start min-[1700px]:grid-cols-3">
              <Panel flush title="Этапы" description="Заявки периода по текущему этапу">
                <div className="overflow-x-auto">
                  <table className={cn("table", EDGE)} data-testid="leads-stages">
                    <thead>
                      <tr>
                        <th>Этап</th>
                        <th className="w-[38%]">Заявок</th>
                        <th className="num">Доля</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.stages.map((st) => (
                        <tr key={st.key}>
                          <td className={cn(st.kind === "won" && "font-medium text-success", st.kind === "lost" && "text-muted")}>{st.label}</td>
                          <td>
                            <BarCell value={st.count} max={Math.max(...s.stages.map((x) => x.count), 1)} align="left">
                              {st.count}
                            </BarCell>
                          </td>
                          <td className="num">{pct(st.share, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel flush title="Причины отказа">
                {s.lost.length ? (
                  <table className={cn("table", EDGE)} data-testid="leads-lost">
                    <thead>
                      <tr>
                        <th>Причина</th>
                        <th className="num">Сделок</th>
                        <th className="num">Доля</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.lost.map((l) => (
                        <tr key={l.label}>
                          <td>{l.label}</td>
                          <td className="num">{l.count}</td>
                          <td className="num">{pct(l.share, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState compact title="Отказов среди заявок периода нет" />
                )}
              </Panel>
              <Panel flush title="Через сколько платят" description="От заявки до первой оплаты">
                <table className={cn("table", EDGE)}>
                  <thead>
                    <tr>
                      <th>Срок</th>
                      <th className="num">Оплат</th>
                      <th className="num">Доля</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.payDelay.map((d) => (
                      <tr key={d.label}>
                        <td>{d.label}</td>
                        <td className="num">{num(d.count)}</td>
                        <td className="num">{pct(d.share, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
          </section>

          <section aria-labelledby="when-h" className="space-y-2">
            <SectionHead id="when-h" title="Когда пишут" meta="По времени первой заявки" />
            <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
              <Panel flush title="День недели">
                <CutTable rows={s.byWeekday} first="День" />
              </Panel>
              <Panel flush title="Время суток">
                <CutTable rows={s.byHour} first="Часы" />
              </Panel>
            </div>
          </section>
        </>
      ) : (
        <div className="panel">
          <EmptyState icon={Users} title="За период заявок нет">
            Выберите другой период или снимите фильтр по менеджеру.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
