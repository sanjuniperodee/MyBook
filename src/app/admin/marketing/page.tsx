import { container } from "@/server/container";
import Link from "next/link";
import { can, requireStaff } from "@/server/access";
import { conversion, costPerLead, romi } from "@/modules/marketing";
import { SpendForm } from "./SpendForm";
import { channels as channelLabels } from "@/shared/domain/channels";
import { channelLabel } from "@/shared/domain/channels";
import { landings } from "@/lib/content/landings";
import { env } from "@/config/env";
import { formatPrice } from "@/config/site";
import { BarList } from "@/components/admin/charts";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ссылки и каналы</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Создайте ссылку с UTM-метками для каждого места, где рекламируетесь: шапка Instagram, сторис, блогер, листовка. CRM посчитает переходы, регистрации, заявки и продажи по каждой ссылке и каналу.
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1 text-sm">
          {periods.map(([d, label]) => (
            <Link key={d} href={`/admin/marketing?period=${d}`} className={cn("rounded-lg px-3 py-1.5", d === period ? "bg-ink text-white" : "text-ink-soft hover:bg-cream")}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      {showAnalytics ? (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-x-auto rounded-2xl border border-line bg-white p-5" data-testid="channels">
            <h2 className="mb-4 font-semibold">Откуда приходят клиенты</h2>
            <table className="w-full min-w-[760px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:bg-white [&_tr>*:first-child]:z-[1] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 font-medium">Канал</th>
                  <th className="pb-2 text-right font-medium">Переходы</th>
                  <th className="pb-2 text-right font-medium">Регистрации</th>
                  <th className="pb-2 text-right font-medium">Начали книгу</th>
                  <th className="pb-2 text-right font-medium">Заявки</th>
                  <th className="pb-2 text-right font-medium">Продажи</th>
                  <th className="pb-2 text-right font-medium">Конверсия</th>
                  <th className="pb-2 text-right font-medium">Выручка</th>
                  <th className="pb-2 text-right font-medium">Расход</th>
                  <th className="pb-2 text-right font-medium">Заявка</th>
                  <th className="pb-2 text-right font-medium">ROMI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.channels.map((c) => (
                  <tr key={c.key}>
                    <td className="py-2 font-medium">{c.label}</td>
                    <td className="py-2 text-right tabular-nums">{c.clicks || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{c.registrations}</td>
                    <td className="py-2 text-right tabular-nums">{c.startedBook}</td>
                    <td className="py-2 text-right tabular-nums">{c.leads}</td>
                    <td className="py-2 text-right tabular-nums">{c.sales}</td>
                    <td className="py-2 text-right tabular-nums">{pct(conversion(c))}</td>
                    <td className="py-2 text-right tabular-nums">{formatPrice(c.revenue)}</td>
                    <td className="py-2 text-right tabular-nums">{c.spend ? formatPrice(c.spend) : "—"}</td>
                    <td className="py-2 text-right tabular-nums">{costPerLead(c) !== null ? formatPrice(costPerLead(c)!) : "—"}</td>
                    <td className={cn("py-2 text-right tabular-nums", (romi(c) ?? 0) < 0 && "text-red-700")}>{romiLabel(c)}</td>
                  </tr>
                ))}
              </tbody>
              {report.channels.length ? (
                <tfoot className="border-t-2 border-line font-semibold">
                  <tr>
                    <td className="py-2">Итого</td>
                    <td className="py-2 text-right tabular-nums">{report.total.clicks || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{report.total.registrations}</td>
                    <td className="py-2 text-right tabular-nums">{report.total.startedBook}</td>
                    <td className="py-2 text-right tabular-nums">{report.total.leads}</td>
                    <td className="py-2 text-right tabular-nums">{report.total.sales}</td>
                    <td className="py-2 text-right tabular-nums">{pct(conversion(report.total))}</td>
                    <td className="py-2 text-right tabular-nums">{formatPrice(report.total.revenue)}</td>
                    <td className="py-2 text-right tabular-nums">{report.total.spend ? formatPrice(report.total.spend) : "—"}</td>
                    <td className="py-2 text-right tabular-nums">{costPerLead(report.total) !== null ? formatPrice(costPerLead(report.total)!) : "—"}</td>
                    <td className="py-2 text-right tabular-nums">{romiLabel(report.total)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
            {report.channels.length === 0 ? <p className="py-4 text-sm text-muted">За период нет новых клиентов и заявок.</p> : null}
            <p className="mt-3 text-xs text-muted">
              Регистрации — новые аккаунты на сайте по источнику первого визита. Заявки — сделки (сайт, чаты, звонки). Продажи — оплатившие клиенты и успешные сделки без заказа на сайте. Выручка
              когортная: деньги клиентов и заявок, пришедших за период, поэтому ROMI занижен — часть оплат придёт позже, а продажи без метки канала уходят в «Прямые» и «Сарафан». Стоимость заявки — расход на регистрации и заявки канала.
            </p>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-4 font-semibold">Выручка по каналам</h2>
            {report.channels.some((c) => c.revenue) ? (
              <BarList rows={report.channels.filter((c) => c.revenue).map((c) => ({ label: c.label, value: c.revenue }))} format={formatPrice} />
            ) : (
              <p className="text-sm text-muted">Продаж за период пока нет.</p>
            )}
          </section>
        </div>
      ) : null}

      {can(staff, "promo.manage") ? (
        <SpendForm
          channels={Object.entries(channelLabels).map(([key, label]) => ({ key, label }))}
          recent={spendRows.map((r) => ({ id: r.id, label: `${r.day.slice(8, 10)}.${r.day.slice(5, 7)} · ${channelLabels[r.channel as keyof typeof channelLabels] ?? r.channel} · ${formatPrice(r.amount)}${r.note ? ` · ${r.note}` : ""}` }))}
        />
      ) : null}

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Ссылки</h2>
          <Link href={sp.archived === "1" ? "/admin/marketing" : "/admin/marketing?archived=1"} className="text-xs text-muted hover:text-wine">
            {sp.archived === "1" ? "← активные" : "архив"}
          </Link>
        </div>
        {can(staff, "promo.manage") ? <LinkBuilder pages={pages} baseUrl={env.appUrl} /> : null}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:bg-white [&_tr>*:first-child]:z-[1] text-sm" data-testid="links">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Ссылка</th>
                <th className="pb-2 font-medium">Метки</th>
                <th className="pb-2 text-right font-medium">Переходы</th>
                <th className="pb-2 text-right font-medium">Регистрации</th>
                <th className="pb-2 text-right font-medium">Заявки</th>
                <th className="pb-2 text-right font-medium">Продажи</th>
                <th className="pb-2 text-right font-medium">Выручка</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleLinks.map((l) => {
                const m = report.links.get(l.slug);
                return (
                  <tr key={l.id} className="align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted">
                        {l.kind === "whatsapp" ? "→ WhatsApp" : `→ ${l.targetPath}`} · {channelLabel({ source: l.utmSource, medium: l.utmMedium })} · {formatDate(l.createdAt)}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-muted">
                      {[l.utmSource, l.utmMedium, l.utmCampaign, l.utmContent].filter(Boolean).join(" / ")}
                    </td>
                    <td className="py-2.5 text-right tabular-nums" title={`Всего переходов: ${l.clicks}`}>
                      {m?.clicks ?? 0}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{m?.registrations ?? 0}</td>
                    <td className="py-2.5 text-right tabular-nums">{m?.leads ?? 0}</td>
                    <td className="py-2.5 text-right tabular-nums">{m?.sales ?? 0}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatPrice(m?.revenue ?? 0)}</td>
                    <td className="py-2.5 pl-3 text-right">
                      <LinkRowActions id={l.id} short={marketing.service.shortUrl(l.slug)} full={targets.get(l.id) ?? ""} archived={l.archived} canManage={can(staff, "promo.manage")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleLinks.length === 0 ? <p className="py-4 text-sm text-muted">{sp.archived === "1" ? "Архив пуст." : "Ссылок пока нет — создайте первую для шапки Instagram."}</p> : null}
        </div>
        {can(staff, "settings.manage") ? (
          <WhatsappNumberForm value={waNumber} />
        ) : (
          <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
            Ссылки «Сразу в WhatsApp» ведут на номер магазина {formatPhone(waNumber)}. Он же — в реквизитах на сайте, поэтому его меняет руководитель в «Сайт» → «Реквизиты продавца».
          </p>
        )}
      </section>

      {showAnalytics && report.campaigns.length ? (
        <section className="overflow-x-auto rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-4 font-semibold">Кампании (utm_source / medium / campaign)</h2>
          <table className="w-full min-w-[760px] [&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:bg-white [&_tr>*:first-child]:z-[1] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Метки</th>
                <th className="pb-2 font-medium">Канал</th>
                <th className="pb-2 text-right font-medium">Переходы</th>
                <th className="pb-2 text-right font-medium">Регистрации</th>
                <th className="pb-2 text-right font-medium">Заявки</th>
                <th className="pb-2 text-right font-medium">Продажи</th>
                <th className="pb-2 text-right font-medium">Выручка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.campaigns.map((c) => (
                <tr key={c.key}>
                  <td className="py-2 font-mono text-xs">{[c.source, c.medium, c.campaign].filter(Boolean).join(" / ")}</td>
                  <td className="py-2">{c.channel}</td>
                  <td className="py-2 text-right tabular-nums">{c.clicks || "—"}</td>
                  <td className="py-2 text-right tabular-nums">{c.registrations}</td>
                  <td className="py-2 text-right tabular-nums">{c.leads}</td>
                  <td className="py-2 text-right tabular-nums">{c.sales}</td>
                  <td className="py-2 text-right tabular-nums">{formatPrice(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
