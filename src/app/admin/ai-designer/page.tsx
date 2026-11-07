import Link from "next/link";
import { DESIGN_AI_FREE_LIMIT_MAX } from "@/lib/book/design-ai";
import { formatPrice } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatRow, StatTile } from "@/components/admin/charts";
import { SectionHead } from "@/components/admin/SectionHead";
import { DayBars, ShareBar } from "@/components/admin/bars";
import { Sparkles, Users } from "lucide-react";
import { Segmented } from "@/components/admin/Segmented";
import { Section } from "@/components/admin/Section";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/dates";
import { can, requireStaff } from "@/server/access";
import { designAiFreeLimit } from "@/server/designAiStore";
import { container } from "@/server/container";
import { fromEnv, getSetting } from "@/modules/workspace";
import { designAiStats } from "@/server/designAiStats";
import { DesignerSettingsForm, FreeLimitForm, GrantForm } from "./Forms";

export const metadata = { title: "ИИ-дизайнер" };

const PERIODS = [
  [7, "7 дней"],
  [30, "30 дней"],
  [90, "90 дней"],
  [0, "Всё время"],
] as const;

const MODES: Record<string, string> = { edit: "Изменить", create: "Придумать", variants: "3 варианта", review: "Оценить" };
const MODELS: Record<string, string> = { "claude-haiku-5-5": "Haiku — мелкие правки", "claude-sonnet-5-5": "Sonnet — рисунки, оценка", "claude-opus-5-5": "Opus — «Придумать» и «3 варианта»" };
const TARGETS: Record<string, string> = { cover: "Обложка", pages: "Страницы" };
const POLISH: Record<string, string> = { ok: "осмотрел, правок нет", fixed: "осмотрел и поправил" };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0).replace(".", ",")} с`);

export default async function AiDesignerPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const staff = await requireStaff("analytics.view");
  const { days: raw } = await searchParams;
  const days = PERIODS.find(([d]) => String(d) === raw)?.[0] ?? 30;
  const limit = await designAiFreeLimit();
  const [s, settings, apiKey] = await Promise.all([designAiStats(days, limit), container().assistant.designSettings(), getSetting("ai.apiKey")]);
  const canEdit = can(staff, "settings.manage");
  const t = s.totals;
  const perRequest = t.ok ? t.costUsd / t.ok : 0;
  // Средний расход на запрос по режиму за период — подсказка рядом с выбором модели (рисунки считаются в «Изменить» вместе с мелкими правками).
  const modeHints = Object.fromEntries(s.byMode.map((m) => [m.key, `${usd(m.costUsd / Math.max(1, m.requests))} за запрос, ${m.requests} шт.`]));

  const tokens = `Токены: вход ${Math.round(t.inputTokens / 1000).toLocaleString("ru-RU")} тыс., выход ${Math.round(t.outputTokens / 1000).toLocaleString("ru-RU")} тыс.`;

  const nav = [
    { group: "Статистика", items: [["totals", "Итоги"], ["people", "От бесплатных до покупки"], ["modes", "Режимы и модели"], ["days", "По дням"], ["users", "Кто пользуется"], ["recent", "Последние запросы"]] },
    { group: "Настройки", items: [["models", "Модели и включение"], ["limit", "Бесплатный лимит"]] },
  ] as const;
  const maxModes = Math.max(...s.byMode.map((m) => m.requests), 1);
  const maxModels = Math.max(...s.byModel.map((m) => m.requests), 1);
  const maxTargets = Math.max(...s.byTarget.map((m) => m.requests), 1);
  const peopleRows = [
    { label: "Попробовали", value: s.people.used, note: undefined },
    { label: `Использовали все ${limit} бесплатных`, value: s.people.hitLimit, note: pct(s.people.hitLimit, s.people.used) },
    { label: "Держат купленные запросы", value: s.people.withCredits, note: s.people.creditsLeft ? `осталось ${s.people.creditsLeft}` : undefined },
  ];
  const maxPeople = Math.max(...peopleRows.map((r) => r.value), 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="ИИ-дизайнер" meta={<Badge tone={settings.enabled ? "success" : "neutral"} dot>{settings.enabled ? "включён" : "выключен"}</Badge>}>
        Кто и как пользуется ИИ-дизайнером на сайте, во что это обходится и сколько клиентов дошло до покупки пакета. Модели и бесплатный лимит — в настройках внизу страницы.
      </PageHeader>

      <div className="grid items-start gap-5 xl:grid-cols-[12rem_minmax(0,1fr)] xl:gap-8">
        {/* Якоря разделов: слева липкий указатель (статистика и настройки), на телефоне — лента чипов. */}
        <nav aria-label="Разделы страницы" className="m-hscroll flex flex-wrap gap-1.5 xl:sticky xl:top-[calc(var(--topbar-h)+1rem)] xl:flex-col xl:gap-0">
          {nav.map((g) => (
            <div key={g.group} className="contents xl:mt-3 xl:block xl:first:mt-0">
              <span className="hidden px-2.5 pb-1 text-xs font-semibold text-muted xl:block">{g.group}</span>
              {g.items.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="chip max-xl:h-10 xl:h-8 xl:border-transparent xl:bg-transparent xl:px-2.5 xl:hover:bg-sunken">
                  {label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 space-y-8">
          <Segmented className="self-start" label="Период" items={PERIODS.map(([d, label]) => ({ key: String(d), label, href: `/admin/ai-designer?days=${d}`, active: days === d }))} />

          <section id="totals" aria-label="Итоги периода" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-2" data-testid="ai-designer-totals">
            <StatRow cols={4}>
              <StatTile bare label="Запросов" value={String(t.ok)} hint={`бесплатных ${t.free}, купленных ${t.credit}${t.failed ? `, сбоев ${t.failed}` : ""}`} />
              <StatTile bare label="Клиентов" value={String(t.users)} hint={t.users ? `в среднем ${(t.ok / t.users).toFixed(1).replace(".", ",")} запроса на клиента` : "пока никто"} />
              <StatTile bare label="Расходы на модели" value={usd(t.costUsd)} hint={t.ok ? `${usd(perRequest)} за запрос` : "—"} />
              <StatTile bare label="Время ответа" value={secs(t.avgMs)} hint={t.polished ? `осмотр картинкой ${t.polished}, поправил ${t.polishFixed}` : "осмотров картинкой нет"} />
            </StatRow>
            <p className="text-xs text-muted">
              {t.estimated ? `У ${t.estimated} запросов (до 24.10.2026) модель не записана: расход оценён по токенам по прайсу Haiku. ${tokens}` : `${tokens} Расход — по прайсу Anthropic из кода, не по счёту.`}
            </p>
          </section>

          <section id="people" aria-labelledby="people-h" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-2">
            <SectionHead id="people-h" title="От бесплатных до покупки" meta="За всё время, не за период" />
            <div className="panel overflow-hidden">
              <table className="table">
                <tbody>
                  {peopleRows.map((r) => (
                    <tr key={r.label}>
                      <td className="w-1/2">{r.label}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="w-10 shrink-0 text-right font-medium tabular-nums">{r.value}</span>
                          <ShareBar value={r.value} max={maxPeople} className="h-1.5 flex-1" />
                        </div>
                      </td>
                      <td className="num w-28 text-xs whitespace-nowrap text-muted max-sm:hidden">{r.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="grid grid-cols-2 gap-px border-t border-line bg-line text-sm">
                <div className="bg-white px-4 py-3 sm:px-5">
                  <dt className="text-muted">Оплачено пакетов</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">{s.purchases.paid}</dd>
                  <dd className="text-xs text-muted tabular-nums">{formatPrice(s.purchases.paidAmount)}</dd>
                </div>
                <div className="bg-white px-4 py-3 sm:px-5">
                  <dt className="text-muted">Ждут оплаты</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums">{s.purchases.pending}</dd>
                  <dd className="text-xs text-muted tabular-nums">{formatPrice(s.purchases.pendingAmount)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section id="modes" aria-labelledby="modes-h" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-2">
            <SectionHead id="modes-h" title="Режимы и модели" meta="Сколько запросов, расход и среднее время ответа" />
            <div className="panel overflow-hidden">
              {s.byMode.length ? (
                <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                  {[
                    { title: "Режимы", max: maxModes, rows: s.byMode.map((m) => ({ key: m.key, label: MODES[m.key] ?? m.key, value: m.requests, note: `${usd(m.costUsd)}, ${secs(m.avgMs)}` })) },
                    { title: "Модели", max: maxModels, rows: s.byModel.map((m) => ({ key: m.key, label: MODELS[m.key] ?? m.key, value: m.requests, note: usd(m.costUsd) })) },
                    { title: "Что оформляют", max: maxTargets, rows: s.byTarget.map((m) => ({ key: m.key, label: TARGETS[m.key] ?? m.key, value: m.requests, note: undefined as string | undefined })) },
                  ].map((g) => (
                    <div key={g.title} className="min-w-0 px-4 py-4 sm:px-5">
                      <h3 className="mb-3 text-xs font-semibold text-ink-soft">{g.title}</h3>
                      <ul className="space-y-3">
                        {g.rows.map((r) => (
                          <li key={r.key} className="text-sm">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="min-w-0 truncate text-ink-soft">{r.label}</span>
                              <span className="shrink-0 font-medium tabular-nums">{r.value}</span>
                            </div>
                            <ShareBar value={r.value} max={g.max} className="mt-1" />
                            {r.note ? <div className="mt-0.5 text-xs text-muted tabular-nums">{r.note}</div> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState compact icon={Sparkles} title="За период запросов нет">
                  Когда клиенты попросят ИИ-дизайнера изменить обложку или страницы, режимы и модели появятся здесь.
                </EmptyState>
              )}
            </div>
          </section>

          {s.byDay.length ? (
            <section id="days" aria-labelledby="days-h" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-2">
              <SectionHead id="days-h" title="По дням" meta="Запросов за день и сколько клиентов их сделали" />
              <div className="panel px-4 pt-6 pb-3 sm:px-5">
                <DayBars data={s.byDay.map((d) => ({ key: d.day, label: formatDate(d.day), value: d.requests, note: `${d.users} ${d.users === 1 ? "клиент" : "клиентов"}` }))} />
                <div className="mt-2 flex justify-between text-xs text-muted tabular-nums">
                  <span>{formatDate(s.byDay[0].day)}</span>
                  <span>{formatDate(s.byDay[s.byDay.length - 1].day)}</span>
                </div>
              </div>
            </section>
          ) : (
            <span id="days" />
          )}

          <section id="users" aria-labelledby="users-h" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-2">
            <SectionHead id="users-h" title="Кто пользуется" meta="Больше всего запросов за период. «Подарить» кладёт запросы клиенту на баланс, как купленные" />
            <div className="panel overflow-hidden">
              {s.topUsers.length ? (
                <div className="overflow-x-auto">
                  <table className="table min-w-[760px]">
                    <thead>
                      <tr>
                        <th>Клиент</th>
                        <th className="num">Запросов</th>
                        <th className="num">Бесплатных / купленных</th>
                        <th className="num">Расход</th>
                        <th className="num">Баланс</th>
                        <th>Последний</th>
                        {canEdit ? <th>Подарить запросы</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {s.topUsers.map((u) => (
                        <tr key={u.userId}>
                          <td>
                            <Link href={`/admin/clients/${u.userId}`} className="font-medium text-wine hover:underline">
                              {u.name || u.email}
                            </Link>
                            {u.name ? <div className="text-xs text-muted">{u.email}</div> : null}
                          </td>
                          <td className="num font-medium">{u.requests}</td>
                          <td className="num text-muted">
                            {u.free} / {u.credit}
                          </td>
                          <td className="num">{usd(u.costUsd)}</td>
                          <td className="num">{u.credits}</td>
                          <td className="whitespace-nowrap text-muted">{formatDate(u.lastAt, true)}</td>
                          {canEdit ? (
                            <td>
                              <GrantForm userId={u.userId} />
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState compact icon={Users} title="За период запросов нет">
                  Здесь появятся клиенты, которые больше всех пользуются ИИ-дизайнером.
                </EmptyState>
              )}
            </div>
          </section>

          <section id="recent" aria-labelledby="recent-h" className="scroll-mt-[calc(var(--topbar-h)+1rem)] space-y-2">
            <SectionHead
              id="recent-h"
              title="Последние запросы"
              meta={`Просьбы клиентов дословно — чтобы разбирать качество. Замечания — ответ модели применился не полностью.${t.withErrors ? ` С замечаниями: ${t.withErrors} из ${t.ok} (${pct(t.withErrors, t.ok)}).` : ""}`}
            />
            <div className="panel overflow-hidden">
              {s.recent.length ? (
                <ul className="divide-y divide-line">
                  {s.recent.map((r) => (
                    <li key={r.id} className="grid gap-x-6 gap-y-2 px-4 py-3.5 text-sm sm:px-5 lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
                      <div className="min-w-0">
                        <Link href={`/admin/clients/${r.userId}`} className="font-medium text-wine hover:underline">
                          {r.name || r.email}
                        </Link>
                        <div className="truncate text-xs text-muted">«{r.bookTitle}»</div>
                        <div className="text-xs text-muted tabular-nums">{formatDate(r.at, true)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1">
                          <Badge>{TARGETS[r.target] ?? r.target}</Badge>
                          <Badge>{MODES[r.mode] ?? r.mode}</Badge>
                          <Badge tone={r.source === "free" ? "neutral" : "accent"}>{r.source === "free" ? "бесплатный" : "купленный"}</Badge>
                        </div>
                        <p className="text-ink-soft">{r.prompt}</p>
                      </div>
                      <div className="min-w-0 text-xs">
                        {r.status === "failed" ? <Badge tone="danger">сбой модели</Badge> : r.status === "pending" ? <Badge>идёт</Badge> : <Badge tone="success">ответ получен</Badge>}
                        <div className="mt-1 text-muted">
                          {r.model ? (MODELS[r.model] ?? r.model).split(" — ")[0] : "Haiku (оценка)"}, {secs(r.ms)}
                          {r.costUsd !== null ? `, ${usd(r.costUsd)}` : ""}
                        </div>
                        {r.polish ? <div className="text-muted">{POLISH[r.polish] ?? r.polish}</div> : null}
                        {r.errors ? (
                          <div className="truncate text-warning" title={r.lastError}>
                            замечаний: {r.errors}
                            {r.lastError ? ` — ${r.lastError}` : ""}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact icon={Sparkles} title="За период запросов нет">
                  Просьбы клиентов к ИИ-дизайнеру будут видны здесь дословно.
                </EmptyState>
              )}
            </div>
          </section>

          <section aria-labelledby="ai-settings-h" className="space-y-3">
            <SectionHead id="ai-settings-h" title="Настройки" meta={canEdit ? undefined : "Менять настройки может руководитель"} />
            <div id="models" className="scroll-mt-[calc(var(--topbar-h)+1rem)]">
              <Section title="Модели и включение" defaultOpen={false} badge={<Badge tone={settings.enabled ? "success" : "neutral"} dot>{settings.enabled ? "включён" : "выключен"}</Badge>} description="Какая модель отвечает на какую просьбу и осмотр картинкой">
                <DesignerSettingsForm settings={settings} hints={modeHints} keyReady={!!apiKey || fromEnv("ai.apiKey")} canEdit={canEdit} />
              </Section>
            </div>
            <div id="limit" className="scroll-mt-[calc(var(--topbar-h)+1rem)]">
              <Section title="Бесплатный лимит" badge={<Badge>{limit} на клиента</Badge>} description="Сколько запросов клиент получает бесплатно">
                <FreeLimitForm limit={limit} max={DESIGN_AI_FREE_LIMIT_MAX} canEdit={canEdit} />
                {!canEdit ? <p className="mt-2 text-xs text-muted">Менять лимит может руководитель.</p> : null}
              </Section>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
