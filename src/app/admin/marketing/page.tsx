import { container } from "@/server/container";
import { can, requireStaff } from "@/server/access";
import { conversion, costPerLead, romi } from "@/modules/marketing";
import { SpendForm } from "./SpendForm";
import { channels as channelLabels } from "@/shared/domain/channels";
import { channelLabel } from "@/shared/domain/channels";
import { landings } from "@/lib/content/landings";
import { env } from "@/config/env";
import { formatPrice } from "@/config/site";
import { StatRow, StatTile } from "@/components/admin/charts";
import { SectionHead } from "@/components/admin/SectionHead";
import { BarCell, ShareBar } from "@/components/admin/bars";
import { DrawerButton } from "@/components/admin/Drawer";
import { Link2, Plus, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Segmented } from "@/components/admin/Segmented";
import { Intro } from "@/components/admin/Intro";
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

  const maxRevenue = Math.max(...report.channels.map((c) => c.revenue), 0);
  const manage = can(staff, "promo.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ссылки и каналы"
        actions={
          manage ? (
            <>
              <DrawerButton variant="primary" label="Создать ссылку" icon={<Link2 className="size-4" strokeWidth={1.8} aria-hidden />} title="Новая ссылка" description="Короткая ссылка с UTM-метками: CRM посчитает переходы, заявки и продажи по ней" testId="new-link">
                <LinkBuilder pages={pages} baseUrl={env.appUrl} />
              </DrawerButton>
              <DrawerButton
                variant="outline"
                label="Расход на рекламу"
                icon={<Plus className="size-4" strokeWidth={1.8} aria-hidden />}
                title="Расход на рекламу"
                testId="new-spend"
              >
                <SpendForm
                  channels={Object.entries(channelLabels).map(([key, label]) => ({ key, label }))}
                  recent={spendRows.map((r) => ({ id: r.id, day: `${r.day.slice(8, 10)}.${r.day.slice(5, 7)}`, channel: channelLabels[r.channel as keyof typeof channelLabels] ?? r.channel, amount: formatPrice(r.amount), note: r.note ?? "" }))}
                />
              </DrawerButton>
            </>
          ) : null
        }
      >
        Создайте ссылку с UTM-метками для каждого места, где рекламируетесь: шапка Instagram, сторис, блогер, листовка. CRM посчитает переходы, регистрации, заявки и продажи по каждой ссылке и каналу.
      </PageHeader>

      <Segmented className="self-start" label="Период" items={periods.map(([d, label]) => ({ key: String(d), label, href: `/admin/marketing?period=${d}${archived ? "&archived=1" : ""}`, active: d === period }))} />

      {showAnalytics ? (
        <>
          <section aria-label="Итоги каналов">
            <StatRow cols={5} className="max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:max-xl:[&>*:last-child]:col-span-2">
              <StatTile bare label="Выручка" value={formatPrice(t.revenue)} hint="деньги клиентов, пришедших за период" />
              <StatTile bare label="Заявки" value={t.leads.toLocaleString("ru-RU")} hint={`регистраций ${t.registrations}, переходов ${t.clicks || 0}`} />
              <StatTile bare label="Продажи" value={t.sales.toLocaleString("ru-RU")} hint={`конверсия ${pct(conversion(t))}`} />
              <StatTile bare label="Расход на рекламу" value={t.spend ? formatPrice(t.spend) : "—"} hint={costPerLead(t) !== null ? `заявка ${formatPrice(costPerLead(t)!)}` : "добавьте расходы"} />
              <StatTile bare label="ROMI" value={romiLabel(t)} hint="занижен: часть оплат придёт позже" />
            </StatRow>
          </section>

          <section aria-labelledby="channels-h" className="space-y-2">
            <SectionHead id="channels-h" title="Откуда приходят клиенты" meta="По источнику первого визита и каналу заявки" />
            <div className="panel overflow-hidden" data-testid="channels">
              {report.channels.length ? (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="table min-w-[860px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-[1] [&_td:first-child]:bg-white">
                      <thead>
                        <tr>
                          <th>Канал</th>
                          <th className="num">Переходы</th>
                          <th className="num">Регистрации</th>
                          <th className="num">Начали книгу</th>
                          <th className="num">Заявки</th>
                          <th className="num">Продажи</th>
                          <th className="num">Конверсия</th>
                          <th className="num">Выручка</th>
                          <th className="num">Расход</th>
                          <th className="num">Заявка</th>
                          <th className="num">ROMI</th>
                        </tr>
                      </thead>
                      <tbody className="[&_td]:whitespace-nowrap">
                        {report.channels.map((c) => (
                          <tr key={c.key}>
                            <td className="font-medium">{c.label}</td>
                            <td className="num text-muted">{c.clicks || "—"}</td>
                            <td className="num">{c.registrations}</td>
                            <td className="num">{c.startedBook}</td>
                            <td className="num">{c.leads}</td>
                            <td className="num">{c.sales}</td>
                            <td className="num text-muted">{pct(conversion(c))}</td>
                            <td className="num">
                              <BarCell value={c.revenue} max={maxRevenue}>
                                {formatPrice(c.revenue)}
                              </BarCell>
                            </td>
                            <td className="num">{c.spend ? formatPrice(c.spend) : "—"}</td>
                            <td className="num">{costPerLead(c) !== null ? formatPrice(costPerLead(c)!) : "—"}</td>
                            <td className={cn("num", (romi(c) ?? 0) < 0 && "text-danger")}>{romiLabel(c)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="[&_td]:border-t [&_td]:border-line-strong [&_td]:bg-[color-mix(in_srgb,var(--color-sunken)_40%,var(--color-white))]! [&_td]:px-3 [&_td]:py-2.5 [&_td]:font-semibold [&_td]:whitespace-nowrap">
                        <tr>
                          <td>Итого</td>
                          <td className="num">{t.clicks || "—"}</td>
                          <td className="num">{t.registrations}</td>
                          <td className="num">{t.startedBook}</td>
                          <td className="num">{t.leads}</td>
                          <td className="num">{t.sales}</td>
                          <td className="num">{pct(conversion(t))}</td>
                          <td className="num">{formatPrice(t.revenue)}</td>
                          <td className="num">{t.spend ? formatPrice(t.spend) : "—"}</td>
                          <td className="num">{costPerLead(t) !== null ? formatPrice(costPerLead(t)!) : "—"}</td>
                          <td className="num">{romiLabel(t)}</td>
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
                        <ShareBar value={c.revenue} max={maxRevenue} />
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
                  Создайте ссылку и разместите её — регистрации и заявки по ней появятся здесь.
                </EmptyState>
              )}
              <div className="border-t border-line px-4 py-3 sm:px-5">
                <Intro small>
                  Регистрации — новые аккаунты на сайте по источнику первого визита. Заявки — сделки (сайт, чаты, звонки). Продажи — оплатившие клиенты и успешные сделки без заказа на сайте. Выручка когортная: деньги клиентов и
                  заявок, пришедших за период, поэтому ROMI занижен — часть оплат придёт позже, а продажи без метки канала уходят в «Прямые» и «Сарафан». Стоимость заявки — расход на регистрации и заявки канала.
                </Intro>
              </div>
            </div>
            {!report.channels.some((c) => c.revenue) && report.channels.length ? (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Wallet className="size-3.5" aria-hidden /> Продаж за период пока нет: доли выручки по каналам появятся с первой оплатой.
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      <section aria-labelledby="links-h" className="space-y-2">
        <SectionHead
          id="links-h"
          title="Ссылки"
          meta={<span className="max-sm:hidden">{archived ? "Архивные ссылки не работают — верните, чтобы снова принимать переходы" : "Короткая ссылка ведёт на сайт или в WhatsApp и запоминает канал"}</span>}
          actions={
            <Segmented
              label="Какие ссылки"
              items={[
                { key: "active", label: "Активные", href: `/admin/marketing?period=${period}`, active: !archived },
                { key: "archived", label: "Архив", href: `/admin/marketing?period=${period}&archived=1`, active: archived },
              ]}
            />
          }
        />
        <div className="panel overflow-hidden">
          <div data-testid="links">
            {visibleLinks.length ? (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="table min-w-[980px]">
                    <thead>
                      <tr>
                        <th>Ссылка</th>
                        <th>Метки</th>
                        <th className="num">Переходы</th>
                        <th className="num">Регистрации</th>
                        <th className="num">Заявки</th>
                        <th className="num">Продажи</th>
                        <th className="num">Выручка</th>
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
                            <td className="num" title={`Всего переходов: ${l.clicks}`}>
                              {m?.clicks ?? 0}
                            </td>
                            <td className="num">{m?.registrations ?? 0}</td>
                            <td className="num">{m?.leads ?? 0}</td>
                            <td className="num">{m?.sales ?? 0}</td>
                            <td className="num font-medium whitespace-nowrap">{formatPrice(m?.revenue ?? 0)}</td>
                            <td className="num">
                              <LinkRowActions id={l.id} short={marketing.service.shortUrl(l.slug)} full={targets.get(l.id) ?? ""} archived={l.archived} canManage={manage} />
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
                        <LinkRowActions id={l.id} short={marketing.service.shortUrl(l.slug)} full={targets.get(l.id) ?? ""} archived={l.archived} canManage={manage} />
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <EmptyState compact icon={Link2} title={archived ? "Архив пуст" : "Ссылок пока нет"}>
                {archived ? "Сюда попадают ссылки, которые убрали в архив." : manage ? "Нажмите «Создать ссылку» вверху — например, для шапки Instagram." : "Ссылки появятся, когда руководитель создаст первую."}
              </EmptyState>
            )}
          </div>
          <div className="border-t border-line bg-sunken/30 px-4 py-3 sm:px-5">
            {can(staff, "settings.manage") ? (
              <WhatsappNumberForm value={waNumber} />
            ) : (
              <p className="text-xs text-muted">
                Ссылки «Сразу в WhatsApp» ведут на номер магазина {formatPhone(waNumber)}. Он же — в реквизитах на сайте, поэтому его меняет руководитель в разделе «Сайт», блок «Реквизиты продавца».
              </p>
            )}
          </div>
        </div>
      </section>

      {showAnalytics && report.campaigns.length ? (
        <section aria-labelledby="campaigns-h" className="space-y-2">
          <SectionHead id="campaigns-h" title="Кампании" meta="По меткам utm_source / utm_medium / utm_campaign" />
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table min-w-[760px]">
                <thead>
                  <tr>
                    <th>Метки</th>
                    <th>Канал</th>
                    <th className="num">Переходы</th>
                    <th className="num">Регистрации</th>
                    <th className="num">Заявки</th>
                    <th className="num">Продажи</th>
                    <th className="num">Выручка</th>
                  </tr>
                </thead>
                <tbody>
                  {report.campaigns.map((c) => (
                    <tr key={c.key}>
                      <td className="font-mono text-xs">{[c.source, c.medium, c.campaign].filter(Boolean).join(" / ")}</td>
                      <td>{c.channel}</td>
                      <td className="num text-muted">{c.clicks || "—"}</td>
                      <td className="num">{c.registrations}</td>
                      <td className="num">{c.leads}</td>
                      <td className="num">{c.sales}</td>
                      <td className="num">
                        <BarCell value={c.revenue} max={Math.max(...report.campaigns.map((x) => x.revenue), 0)}>
                          {formatPrice(c.revenue)}
                        </BarCell>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
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
