import Link from "next/link";
import { DESIGN_AI_FREE_LIMIT_MAX } from "@/lib/book/design-ai";
import { formatPrice } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { BarList, StatRow, StatTile } from "@/components/admin/charts";
import { Sparkles, Users } from "lucide-react";
import { Segmented } from "@/components/admin/Segmented";
import { Section } from "@/components/admin/Section";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/class-names";
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

/** Отступы первой и последней колонки таблицы — по полям листа. */
const EDGE = "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4 sm:[&_td:last-child]:pr-5 sm:[&_th:last-child]:pr-5";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="ИИ-дизайнер" meta={<Badge tone={settings.enabled ? "success" : "neutral"} dot>{settings.enabled ? "включён" : "выключен"}</Badge>}>
        Кто и как пользуется ИИ-дизайнером на сайте, во что это обходится и сколько клиентов дошло до покупки пакета. Модели и бесплатный лимит — в настройках внизу страницы.
      </PageHeader>

      <Segmented className="self-start" label="Период" items={PERIODS.map(([d, label]) => ({ key: String(d), label, href: `/admin/ai-designer?days=${d}`, active: days === d }))} />

      <section aria-label="Итоги периода" className="space-y-2" data-testid="ai-designer-totals">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="От бесплатных до покупки" description="За всё время, не за период">
          <BarList
            rows={[
              { label: "Попробовали", value: s.people.used },
              { label: `Использовали все ${limit} бесплатных`, value: s.people.hitLimit, note: pct(s.people.hitLimit, s.people.used) },
              { label: "Держат купленные запросы", value: s.people.withCredits, note: s.people.creditsLeft ? `осталось ${s.people.creditsLeft}` : undefined },
            ]}
          />
          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line text-sm">
            <div className="bg-white p-3">
              <dt className="text-muted">Оплачено пакетов</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{s.purchases.paid}</dd>
              <dd className="text-xs text-muted tabular-nums">{formatPrice(s.purchases.paidAmount)}</dd>
            </div>
            <div className="bg-white p-3">
              <dt className="text-muted">Ждут оплаты</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums">{s.purchases.pending}</dd>
              <dd className="text-xs text-muted tabular-nums">{formatPrice(s.purchases.pendingAmount)}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Режимы и модели" description="Сколько запросов, расход и среднее время ответа">
          {s.byMode.length ? (
            <div className="space-y-6">
              <BarList rows={s.byMode.map((m) => ({ label: MODES[m.key] ?? m.key, value: m.requests, note: `${usd(m.costUsd)}, ${secs(m.avgMs)}` }))} />
              <div>
                <h3 className="mb-3 text-sm font-semibold">Модели</h3>
                <BarList rows={s.byModel.map((m) => ({ label: MODELS[m.key] ?? m.key, value: m.requests, note: usd(m.costUsd) }))} />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold">Что оформляют</h3>
                <BarList rows={s.byTarget.map((m) => ({ label: TARGETS[m.key] ?? m.key, value: m.requests }))} />
              </div>
            </div>
          ) : (
            <EmptyState compact icon={Sparkles} title="За период запросов нет">
              Когда клиенты попросят ИИ-дизайнера изменить обложку или страницы, режимы и модели появятся здесь.
            </EmptyState>
          )}
        </Panel>
      </div>

      {s.byDay.length ? (
        <Panel title="По дням" description="Запросов за день и сколько клиентов их сделали">
          <BarList rows={s.byDay.map((d) => ({ label: formatDate(d.day), value: d.requests, note: `${d.users} ${d.users === 1 ? "клиент" : "клиентов"}` }))} />
        </Panel>
      ) : null}

      <Panel flush title="Кто пользуется" description="Больше всего запросов за период. «Подарить» кладёт запросы клиенту на баланс, как купленные">
        {s.topUsers.length ? (
          <div className="overflow-x-auto">
            <table className={cn("table min-w-[760px]", EDGE)}>
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th className="text-right">Запросов</th>
                  <th className="text-right">Бесплатных / купленных</th>
                  <th className="text-right">Расход</th>
                  <th className="text-right">Баланс</th>
                  <th>Последний</th>
                  {canEdit ? <th>Подарить запросы</th> : null}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {s.topUsers.map((u) => (
                  <tr key={u.userId}>
                    <td>
                      <Link href={`/admin/clients/${u.userId}`} className="font-medium text-wine hover:underline">
                        {u.name || u.email}
                      </Link>
                      {u.name ? <div className="text-xs text-muted">{u.email}</div> : null}
                    </td>
                    <td className="text-right font-medium">{u.requests}</td>
                    <td className="text-right text-muted">
                      {u.free} / {u.credit}
                    </td>
                    <td className="text-right">{usd(u.costUsd)}</td>
                    <td className="text-right">{u.credits}</td>
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
      </Panel>

      <Panel
        flush
        title="Последние запросы"
        description={`Просьбы клиентов дословно — чтобы разбирать качество. Замечания — ответ модели применился не полностью.${t.withErrors ? ` С замечаниями: ${t.withErrors} из ${t.ok} (${pct(t.withErrors, t.ok)}).` : ""}`}
      >
        {s.recent.length ? (
          <ul className="divide-y divide-line">
            {s.recent.map((r) => (
              <li key={r.id} className="grid gap-x-6 gap-y-2 px-4 py-3.5 text-sm sm:px-5 lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
                <div className="min-w-0">
                  <Link href={`/admin/clients/${r.userId}`} className="font-medium text-wine hover:underline">
                    {r.name || r.email}
                  </Link>
                  <div className="truncate text-xs text-muted">«{r.bookTitle}»</div>
                  <div className="text-xs text-muted">{formatDate(r.at, true)}</div>
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap gap-1.5">
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
      </Panel>

      <section aria-labelledby="ai-settings-h" className="space-y-3">
        <h2 id="ai-settings-h" className="text-lg font-semibold">
          Настройки
        </h2>
        <Section title="Модели и включение" defaultOpen={false} badge={<Badge tone={settings.enabled ? "success" : "neutral"} dot>{settings.enabled ? "включён" : "выключен"}</Badge>} description="Какая модель отвечает на какую просьбу и осмотр картинкой">
          <DesignerSettingsForm settings={settings} hints={modeHints} keyReady={!!apiKey || fromEnv("ai.apiKey")} canEdit={canEdit} />
        </Section>
        <Section title="Бесплатный лимит" badge={<Badge>{limit} на клиента</Badge>} description="Сколько запросов клиент получает бесплатно">
          <FreeLimitForm limit={limit} max={DESIGN_AI_FREE_LIMIT_MAX} canEdit={canEdit} />
          {!canEdit ? <p className="mt-2 text-xs text-muted">Менять лимит может руководитель.</p> : null}
        </Section>
      </section>
    </div>
  );
}
