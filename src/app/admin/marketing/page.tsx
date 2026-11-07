import { container } from "@/server/container";
import { can, requireStaff } from "@/server/access";
import { conversion, costPerLead, romi } from "@/modules/marketing";
import { SpendForm } from "./SpendForm";
import { channels as channelLabels } from "@/shared/domain/channels";
import { channelLabel } from "@/shared/domain/channels";
import { landings } from "@/lib/content/landings";
import { env } from "@/config/env";
import { formatPrice } from "@/config/site";
import { BarList, StatRow, StatTile } from "@/components/admin/charts";
import { Link2, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { Intro } from "@/components/admin/Intro";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
import { formatPhone } from "@/shared/domain/phone";
import { formatDate } from "@/lib/dates";
import { LinkBuilder, LinkRowActions, WhatsappNumberForm } from "./MarketingControls";

export const metadata = { title: "Ссылки и каналы" };

const periods = [
  [7, "7 дней"],
  [30, "30 дней"],
  [90, "90 дней"],
  [0, "всё время"],
] as const;
/** Отступы первой и последней колонки таблицы — по полям листа. */
const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 1000) / 10}%`);

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ period?: string; archived?: string }> }) {
  const staff = await requireStaff();
  if (!can(staff, "analytics.view") && !can(staff, "promo.manage")) (await import("next/navigation")).notFound();
  const sp = await searchParams;
  const period = periods.find(([d]) => String(d) === sp.period)?.[0] ?? 30;
  const marketing = container().marketing;
  const [report, links, waNumber, spendRows] = await Promise.all([marketing.service.report(period || null), marketing.links.all(), marketing.service.shopWhatsapp(), can(staff, "promo.manage") ? marketing.spend.recent(15) : Promise.resolve([])]);
  const romiLabel = (m: Parameters<typeof romi>[0]) => {
    const r = romi(m);
    return r === null ? "—" : `${r >= 0 ? "+" : ""}${Math.round(r * 100)}%`;
  };
  const visibleLinks = links.filter((l) => (sp.archived === "1" ? l.archived : !l.archived));
  const targets = new Map(await Promise.all(visibleLinks.map(async (l) => [l.id, await marketing.service.target(l)] as const)));
  const showAnalytics = can(staff, "analytics.view");
  const pages = [
    { path: "/", label: "Главная" },
    { path: "/gift", label: "Подарочный сертификат" },
    ...landings.map((l) => ({ path: `/kniga/${l.slug}`, label: l.content.ru.label })),
  ];

  const archived = sp.archived === "1";
  const t = report.total;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ссылки и каналы">
        Создайте ссылку с UTM-метками для каждого места, где рекламируетесь: шапка Instagram, сторис, блогер, листовка. CRM посчитает переходы, регистрации, заявки и продажи по каждой ссылке и каналу.
      </PageHeader>

      <Segmented className="self-start" label="Период" items={periods.map(([d, label]) => ({ key: String(d), label, href: `/admin/marketing?period=${d}${archived ? "&archived=1" : ""}`, active: d === period }))} />

      {showAnalytics ? (
        <>
          <section aria-label="Итоги каналов" className="space-y-2">
            <StatRow cols={5} className="max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:max-xl:[&>*:last-child]:col-span-2">
              <StatTile bare label="Заявки" value={t.leads.toLocaleString("ru-RU")} hint={`регистраций ${t.registrations}, переходов ${t.clicks || 0}`} />
              <StatTile bare label="Продажи" value={t.sales.toLocaleString("ru-RU")} hint={`конверсия ${pct(conversion(t))}`} />
              <StatTile bare label="Выручка" value={formatPrice(t.revenue)} hint="деньги клиентов, пришедших за период" />
              <StatTile bare label="Расход на рекламу" value={t.spend ? formatPrice(t.spend) : "—"} hint={costPerLead(t) !== null ? `заявка ${formatPrice(costPerLead(t)!)}` : "добавьте расходы ниже"} />
              <StatTile bare label="ROMI" value={romiLabel(t)} hint="занижен: часть оплат придёт позже" />
            </StatRow>
          </section>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel flush title="Откуда приходят клиенты" description="По источнику первого визита и каналу заявки">
              <div data-testid="channels">
                {report.channels.length ? (
                  <>
                    <div className="hidden overflow-x-auto lg:block">
                      <table className={cn("table min-w-[860px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-[1] [&_tr>*:first-child]:bg-white", EDGE)}>
                        <thead>
                          <tr>
                            <th>Канал</th>
                            <th className="text-right">Переходы</th>
                            <th className="text-right">Регистрации</th>
                            <th className="text-right">Начали книгу</th>
                            <th className="text-right">Заявки</th>
                            <th className="text-right">Продажи</th>
                            <th className="text-right">Конверсия</th>
                            <th className="text-right">Выручка</th>
                            <th className="text-right">Расход</th>
                            <th className="text-right">Заявка</th>
                            <th className="text-right">ROMI</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums [&_td]:whitespace-nowrap">
                          {report.channels.map((c) => (
                            <tr key={c.key}>
                              <td className="font-medium">{c.label}</td>
                              <td className="text-right text-muted">{c.clicks || "—"}</td>
                              <td className="text-right">{c.registrations}</td>
                              <td className="text-right">{c.startedBook}</td>
                              <td className="text-right">{c.leads}</td>
                              <td className="text-right">{c.sales}</td>
                              <td className="text-right text-muted">{pct(conversion(c))}</td>
                              <td className="text-right font-medium">{formatPrice(c.revenue)}</td>
                              <td className="text-right">{c.spend ? formatPrice(c.spend) : "—"}</td>
                              <td className="text-right">{costPerLead(c) !== null ? formatPrice(costPerLead(c)!) : "—"}</td>
                              <td className={cn("text-right", (romi(c) ?? 0) < 0 && "text-danger")}>{romiLabel(c)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="tabular-nums [&_td]:border-t [&_td]:border-line-strong [&_td]:px-3 [&_td]:py-2.5 [&_td]:font-semibold [&_td]:whitespace-nowrap">
                          <tr>
                            <td>Итого</td>
                            <td className="text-right">{t.clicks || "—"}</td>
                            <td className="text-right">{t.registrations}</td>
                            <td className="text-right">{t.startedBook}</td>
                            <td className="text-right">{t.leads}</td>
                            <td className="text-right">{t.sales}</td>
                            <td className="text-right">{pct(conversion(t))}</td>
                            <td className="text-right">{formatPrice(t.revenue)}</td>
                            <td className="text-right">{t.spend ? formatPrice(t.spend) : "—"}</td>
                            <td className="text-right">{costPerLead(t) !== null ? formatPrice(costPerLead(t)!) : "—"}</td>
                            <td className="text-right">{romiLabel(t)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <ul className="divide-y divide-line lg:hidden">
                      {report.channels.map((c) => (
                        <li key={c.key} className="space-y-2 px-4 py-3.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate font-medium">{c.label}</span>
                            <span className="shrink-0 font-semibold tabular-nums">{formatPrice(c.revenue)}</span>
                          </div>
                          <dl className="grid grid-cols-3 gap-2 text-[13px] tabular-nums">
                            <Cell label="Регистрации" value={c.registrations} />
                            <Cell label="Заявки" value={c.leads} />
                            <Cell label="Продажи" value={c.sales} />
                            <Cell label="Конверсия" value={pct(conversion(c))} />
                            <Cell label="Расход" value={c.spend ? formatPrice(c.spend) : "—"} />
                            <Cell label="ROMI" value={romiLabel(c)} warn={(romi(c) ?? 0) < 0} />
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <EmptyState compact icon={Users} title="За период нет новых клиентов и заявок">
                    Создайте ссылку ниже и разместите её — регистрации и заявки по ней появятся здесь.
                  </EmptyState>
                )}
              </div>
              <div className="border-t border-line px-4 py-3 sm:px-5">
                <Intro small>
                  Регистрации — новые аккаунты на сайте по источнику первого визита. Заявки — сделки (сайт, чаты, звонки). Продажи — оплатившие клиенты и успешные сделки без заказа на сайте. Выручка когортная: деньги клиентов и
                  заявок, пришедших за период, поэтому ROMI занижен — часть оплат придёт позже, а продажи без метки канала уходят в «Прямые» и «Сарафан». Стоимость заявки — расход на регистрации и заявки канала.
                </Intro>
              </div>
            </Panel>
            <Panel title="Выручка по каналам">
              {report.channels.some((c) => c.revenue) ? (
                <BarList rows={report.channels.filter((c) => c.revenue).map((c) => ({ label: c.label, value: c.revenue }))} format={formatPrice} />
              ) : (
                <EmptyState compact icon={Wallet} title="Продаж за период пока нет">
                  Полосы по каналам появятся с первой оплатой.
                </EmptyState>
              )}
            </Panel>
          </div>
        </>
      ) : null}

      <Panel
        flush
        title="Ссылки"
        description={archived ? "Архивные ссылки не работают — верните, чтобы снова принимать переходы" : "Короткая ссылка ведёт на сайт или в WhatsApp и запоминает канал"}
        actions={
          <Segmented
            label="Какие ссылки"
            items={[
              { key: "active", label: "Активные", href: `/admin/marketing?period=${period}`, active: !archived },
              { key: "archived", label: "Архив", href: `/admin/marketing?period=${period}&archived=1`, active: archived },
            ]}
          />
        }
      >
        {can(staff, "promo.manage") && !archived ? (
          <div className="border-b border-line p-4 sm:p-5">
            <LinkBuilder pages={pages} baseUrl={env.appUrl} />
          </div>
        ) : null}
        <div data-testid="links">
          {visibleLinks.length ? (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className={cn("table min-w-[980px]", EDGE)}>
                  <thead>
                    <tr>
                      <th>Ссылка</th>
                      <th>Метки</th>
                      <th className="text-right">Переходы</th>
                      <th className="text-right">Регистрации</th>
                      <th className="text-right">Заявки</th>
                      <th className="text-right">Продажи</th>
                      <th className="text-right">Выручка</th>
                      <th>
                        <span className="sr-only">Действия</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLinks.map((l) => {
                      const m = report.links.get(l.slug);
                      return (
                        <tr key={l.id}>
                          <td className="max-w-72">
                            <div className="truncate font-medium">{l.name}</div>
                            <div className="truncate text-xs text-muted">
                              {l.kind === "whatsapp" ? "в WhatsApp" : l.targetPath}, {channelLabel({ source: l.utmSource, medium: l.utmMedium })}, {formatDate(l.createdAt)}
                            </div>
                          </td>
                          <td className="max-w-56 truncate font-mono text-[11px] text-muted">{[l.utmSource, l.utmMedium, l.utmCampaign, l.utmContent].filter(Boolean).join(" / ")}</td>
                          <td className="text-right tabular-nums" title={`Всего переходов: ${l.clicks}`}>
                            {m?.clicks ?? 0}
                          </td>
                          <td className="text-right tabular-nums">{m?.registrations ?? 0}</td>
                          <td className="text-right tabular-nums">{m?.leads ?? 0}</td>
                          <td className="text-right tabular-nums">{m?.sales ?? 0}</td>
                          <td className="text-right font-medium whitespace-nowrap tabular-nums">{formatPrice(m?.revenue ?? 0)}</td>
                          <td className="text-right">
                            <LinkRowActions id={l.id} short={marketing.service.shortUrl(l.slug)} full={targets.get(l.id) ?? ""} archived={l.archived} canManage={can(staff, "promo.manage")} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-line lg:hidden">
                {visibleLinks.map((l) => {
                  const m = report.links.get(l.slug);
                  return (
                    <li key={l.id} className="space-y-2.5 px-4 py-3.5">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.name}</div>
                        <div className="truncate text-xs text-muted">
                          {l.kind === "whatsapp" ? "в WhatsApp" : l.targetPath}, {channelLabel({ source: l.utmSource, medium: l.utmMedium })}
                        </div>
                      </div>
                      <dl className="grid grid-cols-4 gap-2 text-[13px] tabular-nums">
                        <Cell label="Переходы" value={m?.clicks ?? 0} />
                        <Cell label="Заявки" value={m?.leads ?? 0} />
                        <Cell label="Продажи" value={m?.sales ?? 0} />
                        <Cell label="Выручка" value={formatPrice(m?.revenue ?? 0)} />
                      </dl>
                      <LinkRowActions id={l.id} short={marketing.service.shortUrl(l.slug)} full={targets.get(l.id) ?? ""} archived={l.archived} canManage={can(staff, "promo.manage")} />
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <EmptyState compact icon={Link2} title={archived ? "Архив пуст" : "Ссылок пока нет"}>
              {archived ? "Сюда попадают ссылки, которые убрали в архив." : "Создайте первую — например, для шапки Instagram."}
            </EmptyState>
          )}
        </div>
        <div className="border-t border-line p-4 sm:p-5">
          {can(staff, "settings.manage") ? (
            <WhatsappNumberForm value={waNumber} />
          ) : (
            <p className="text-xs text-muted">
              Ссылки «Сразу в WhatsApp» ведут на номер магазина {formatPhone(waNumber)}. Он же — в реквизитах на сайте, поэтому его меняет руководитель в «Сайт» → «Реквизиты продавца».
            </p>
          )}
        </div>
      </Panel>

      {can(staff, "promo.manage") ? (
        <SpendForm
          channels={Object.entries(channelLabels).map(([key, label]) => ({ key, label }))}
          recent={spendRows.map((r) => ({ id: r.id, day: `${r.day.slice(8, 10)}.${r.day.slice(5, 7)}`, channel: channelLabels[r.channel as keyof typeof channelLabels] ?? r.channel, amount: formatPrice(r.amount), note: r.note ?? "" }))}
        />
      ) : null}

      {showAnalytics && report.campaigns.length ? (
        <Panel flush title="Кампании" description="По меткам utm_source / utm_medium / utm_campaign">
          <div className="overflow-x-auto">
            <table className={cn("table min-w-[760px]", EDGE)}>
              <thead>
                <tr>
                  <th>Метки</th>
                  <th>Канал</th>
                  <th className="text-right">Переходы</th>
                  <th className="text-right">Регистрации</th>
                  <th className="text-right">Заявки</th>
                  <th className="text-right">Продажи</th>
                  <th className="text-right">Выручка</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {report.campaigns.map((c) => (
                  <tr key={c.key}>
                    <td className="font-mono text-xs">{[c.source, c.medium, c.campaign].filter(Boolean).join(" / ")}</td>
                    <td>{c.channel}</td>
                    <td className="text-right text-muted">{c.clicks || "—"}</td>
                    <td className="text-right">{c.registrations}</td>
                    <td className="text-right">{c.leads}</td>
                    <td className="text-right">{c.sales}</td>
                    <td className="text-right font-medium whitespace-nowrap">{formatPrice(c.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Cell({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className={cn("truncate font-medium", warn && "text-danger")}>{value}</dd>
    </div>
  );
}
