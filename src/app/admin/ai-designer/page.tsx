import Link from "next/link";
import { DESIGN_AI_FREE_LIMIT_MAX } from "@/lib/book/design-ai";
import { formatPrice } from "@/config/site";
import { PageHeader } from "@/components/admin/PageHeader";
import { BarList, StatTile } from "@/components/admin/charts";
import { cn } from "@/lib/class-names";
import { formatDate } from "@/lib/dates";
import { can, requireStaff } from "@/server/access";
import { designAiFreeLimit } from "@/server/designAiStore";
import { designAiStats } from "@/server/designAiStats";
import { FreeLimitForm, GrantForm } from "./Forms";

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
  const s = await designAiStats(days, limit);
  const canEdit = can(staff, "settings.manage");
  const t = s.totals;
  const perRequest = t.ok ? t.costUsd / t.ok : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="ИИ-дизайнер">Кто и как пользуется ИИ-дизайнером на сайте, во что это обходится и сколько клиентов дошло до покупки пакета. Бесплатный лимит меняется здесь же.</PageHeader>

      <div className="flex max-w-full overflow-x-auto rounded-xl border border-line bg-white p-1 text-sm sm:w-fit">
        {PERIODS.map(([d, label]) => (
          <Link key={d} href={`/admin/ai-designer?days=${d}`} className={cn("inline-flex min-h-10 items-center rounded-lg px-3 whitespace-nowrap lg:min-h-0 lg:py-1.5", days === d ? "bg-ink text-white" : "text-ink-soft hover:bg-cream")}>
            {label}
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-semibold">Бесплатный лимит</h2>
        <FreeLimitForm limit={limit} max={DESIGN_AI_FREE_LIMIT_MAX} canEdit={canEdit} />
        {!canEdit ? <p className="mt-2 text-xs text-muted">Менять лимит может руководитель.</p> : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="ai-designer-totals">
        <StatTile label="Запросов" value={String(t.ok)} hint={`бесплатных ${t.free} · купленных ${t.credit}${t.failed ? ` · сбоев ${t.failed}` : ""}`} />
        <StatTile label="Клиентов" value={String(t.users)} hint={t.users ? `в среднем ${(t.ok / t.users).toFixed(1).replace(".", ",")} запроса на клиента` : "пока никто"} />
        <StatTile label="Расходы на модели" value={usd(t.costUsd)} hint={t.ok ? `${usd(perRequest)} за запрос` : "—"} />
        <StatTile label="Время ответа" value={secs(t.avgMs)} hint={t.polished ? `осмотр картинкой: ${t.polished}, поправил ${t.polishFixed}` : "осмотров картинкой нет"} />
      </div>
      {t.estimated ? (
        <p className="-mt-3 text-xs text-muted">
          У {t.estimated} запросов (до 24.10.2026) модель не записана: расход оценён по токенам по прайсу Haiku. Токены: вход {Math.round(t.inputTokens / 1000).toLocaleString("ru-RU")} тыс., выход {Math.round(t.outputTokens / 1000).toLocaleString("ru-RU")} тыс.
        </p>
      ) : (
        <p className="-mt-3 text-xs text-muted">
          Токены: вход {Math.round(t.inputTokens / 1000).toLocaleString("ru-RU")} тыс., выход {Math.round(t.outputTokens / 1000).toLocaleString("ru-RU")} тыс. Расход — по прайсу Anthropic из кода, не по счёту.
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">От бесплатных до покупки</h2>
          <p className="mt-0.5 text-xs text-muted">За всё время, не за период.</p>
          <div className="mt-4">
            <BarList
              rows={[
                { label: "Попробовали", value: s.people.used },
                { label: `Использовали все ${limit} бесплатных`, value: s.people.hitLimit, note: pct(s.people.hitLimit, s.people.used) },
                { label: "Держат купленные запросы", value: s.people.withCredits, note: s.people.creditsLeft ? `осталось ${s.people.creditsLeft}` : undefined },
              ]}
            />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-muted">Оплачено пакетов</dt>
              <dd className="text-lg font-semibold">{s.purchases.paid}</dd>
              <dd className="text-xs text-muted">{formatPrice(s.purchases.paidAmount)}</dd>
            </div>
            <div>
              <dt className="text-muted">Ждут оплаты</dt>
              <dd className="text-lg font-semibold">{s.purchases.pending}</dd>
              <dd className="text-xs text-muted">{formatPrice(s.purchases.pendingAmount)}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">Режимы</h2>
          <div className="mt-4">
            <BarList rows={s.byMode.map((m) => ({ label: MODES[m.key] ?? m.key, value: m.requests, note: `${usd(m.costUsd)} · ${secs(m.avgMs)}` }))} />
            {!s.byMode.length ? <p className="text-sm text-muted">За период запросов нет.</p> : null}
          </div>
          <h3 className="mt-5 text-sm font-semibold">Модели</h3>
          <div className="mt-3">
            <BarList rows={s.byModel.map((m) => ({ label: MODELS[m.key] ?? m.key, value: m.requests, note: usd(m.costUsd) }))} />
          </div>
          <h3 className="mt-5 text-sm font-semibold">Что оформляют</h3>
          <div className="mt-3">
            <BarList rows={s.byTarget.map((m) => ({ label: TARGETS[m.key] ?? m.key, value: m.requests }))} />
          </div>
        </div>
      </section>

      {s.byDay.length ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">По дням</h2>
          <div className="mt-4">
            <BarList rows={s.byDay.map((d) => ({ label: formatDate(d.day), value: d.requests, note: `${d.users} ${d.users === 1 ? "клиент" : "клиентов"}` }))} />
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-semibold">Кто пользуется</h2>
        <p className="mt-0.5 text-xs text-muted">Больше всего запросов за период. «Подарить» кладёт запросы клиенту на баланс, как купленные.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Клиент</th>
                <th className="px-3 font-medium">Запросов</th>
                <th className="px-3 font-medium">Бесплатных / купленных</th>
                <th className="px-3 font-medium">Расход</th>
                <th className="px-3 font-medium">Баланс</th>
                <th className="px-3 font-medium">Последний</th>
                {canEdit ? <th className="pl-3 font-medium">Подарить запросы</th> : null}
              </tr>
            </thead>
            <tbody>
              {s.topUsers.map((u) => (
                <tr key={u.userId} className="border-b border-line/60 align-middle">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/clients/${u.userId}`} className="font-medium text-wine hover:underline">
                      {u.name || u.email}
                    </Link>
                    {u.name ? <div className="text-xs text-muted">{u.email}</div> : null}
                  </td>
                  <td className="px-3 tabular-nums">{u.requests}</td>
                  <td className="px-3 tabular-nums">
                    {u.free} / {u.credit}
                  </td>
                  <td className="px-3 tabular-nums">{usd(u.costUsd)}</td>
                  <td className="px-3 tabular-nums">{u.credits}</td>
                  <td className="px-3 whitespace-nowrap text-muted">{formatDate(u.lastAt, true)}</td>
                  {canEdit ? (
                    <td className="pl-3">
                      <GrantForm userId={u.userId} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {!s.topUsers.length ? <p className="py-4 text-sm text-muted">За период запросов нет.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-semibold">Последние запросы</h2>
        <p className="mt-0.5 text-xs text-muted">
          Просьбы клиентов дословно — чтобы разбирать качество. Замечания — то, что ответ модели не применился полностью (число и последнее).{t.withErrors ? ` За период с замечаниями: ${t.withErrors} из ${t.ok} (${pct(t.withErrors, t.ok)}).` : ""}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Когда</th>
                <th className="px-3 font-medium">Клиент и книга</th>
                <th className="px-3 font-medium">Что</th>
                <th className="px-3 font-medium">Просьба</th>
                <th className="px-3 font-medium">Итог</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.map((r) => (
                <tr key={r.id} className="border-b border-line/60 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-muted">{formatDate(r.at, true)}</td>
                  <td className="px-3">
                    <Link href={`/admin/clients/${r.userId}`} className="text-wine hover:underline">
                      {r.name || r.email}
                    </Link>
                    <div className="max-w-[14rem] truncate text-xs text-muted">«{r.bookTitle}»</div>
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    <div>{TARGETS[r.target] ?? r.target}</div>
                    <div className="text-xs text-muted">
                      {MODES[r.mode] ?? r.mode} · {r.source === "free" ? "бесплатный" : "купленный"}
                    </div>
                  </td>
                  <td className="max-w-md px-3 text-ink-soft">{r.prompt}</td>
                  <td className="px-3 text-xs whitespace-nowrap">
                    {r.status === "failed" ? <span className="text-red-700">сбой модели</span> : r.status === "pending" ? <span className="text-muted">идёт…</span> : <span className="text-emerald-700">ответ получен</span>}
                    <div className="text-muted">
                      {r.model ? (MODELS[r.model] ?? r.model).split(" — ")[0] : "Haiku (оценка)"} · {secs(r.ms)}
                      {r.costUsd !== null ? ` · ${usd(r.costUsd)}` : ""}
                    </div>
                    {r.polish ? <div className="text-muted">{POLISH[r.polish] ?? r.polish}</div> : null}
                    {r.errors ? (
                      <div className="max-w-[14rem] truncate text-amber-800" title={r.lastError}>
                        замечаний: {r.errors}
                        {r.lastError ? ` — ${r.lastError}` : ""}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!s.recent.length ? <p className="py-4 text-sm text-muted">За период запросов нет.</p> : null}
        </div>
      </section>
    </div>
  );
}
