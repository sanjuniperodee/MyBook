import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { uuid } from "@/server/input";
import { formatDate, nowMs } from "@/lib/dates";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { automationActions, automationTriggers } from "@/modules/automation/domain/meta";
import { runStatusLabels, stepResultLabels, RUNS_LIST_LIMIT, type RunStatus } from "@/modules/automation";
import { RetryRun } from "./RetryRun";

export const metadata = { title: "Журнал правила" };

const statusTone: Record<RunStatus, string> = {
  done: "bg-emerald-50 text-emerald-800",
  error: "bg-red-50 text-red-700",
  deferred: "bg-amber-50 text-amber-800",
  running: "bg-cream text-ink-soft",
};

/** Куда ведёт срабатывание: сделка, чат, заказ или клиент из контекста. */
function target(ctx: { dealId?: string | null; conversationId?: string | null; orderId?: string | null; clientId?: string | null } | undefined) {
  if (!ctx) return null;
  if (ctx.dealId) return { href: `/admin/deals/${ctx.dealId}`, label: "сделка" };
  if (ctx.conversationId) return { href: `/admin/chats?c=${ctx.conversationId}`, label: "чат" };
  if (ctx.orderId) return { href: `/admin/orders/${ctx.orderId}`, label: "заказ" };
  if (ctx.clientId) return { href: `/admin/clients/${ctx.clientId}`, label: "клиент" };
  return null;
}

/** Журнал срабатываний правила (automation-13): что сделало каждое действие, ошибки с «Повторить», отложенные сообщения. */
export default async function AutomationRunsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("settings.manage");
  const id = uuid.safeParse((await params).id);
  if (!id.success) notFound();
  const rule = await container().automation.rules.find(id.data);
  if (!rule) notFound();
  const runs = await container().automation.rules.runs(rule.id);
  const now = nowMs();
  const counts = runs.reduce<Partial<Record<RunStatus, number>>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  const trigger = automationTriggers[rule.trigger as keyof typeof automationTriggers]?.label ?? rule.trigger;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href="/admin/automations" className="inline-flex items-center gap-1 text-sm text-muted hover:text-wine">
        <ChevronLeft className="size-4" /> Автоматизации
      </Link>
      <PageHeader title={rule.name}>
        {trigger} · последние {RUNS_LIST_LIMIT} срабатываний. Каждое правило срабатывает для объекта один раз; здесь видно, что сделало каждое действие. Подробности старше 90 дней очищаются.
      </PageHeader>
      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(runStatusLabels) as RunStatus[]).map((st) =>
          counts[st] ? (
            <span key={st} className={cn("rounded-full px-2.5 py-1", statusTone[st])}>
              {runStatusLabels[st]}: {counts[st]}
            </span>
          ) : null,
        )}
      </div>
      {runs.length ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-white" data-testid="automation-runs">
          {runs.map((r) => {
            const to = target(r.details?.ctx);
            const stale = r.status === "running" && now - r.createdAt.getTime() > 10 * 60_000;
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                <div className="w-36 shrink-0 text-xs text-muted tabular-nums">{formatDate(r.createdAt, true)}</div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-xs", statusTone[r.status])}>{runStatusLabels[r.status]}</span>
                    {to ? (
                      <Link href={to.href} className="text-xs text-wine hover:underline">
                        {to.label}
                      </Link>
                    ) : null}
                    {r.details?.ctx.occasion ? <span className="text-xs text-muted">{r.details.ctx.occasion}</span> : null}
                  </div>
                  {r.details ? (
                    <ol className="space-y-0.5 text-xs text-ink-soft">
                      {r.details.steps.map((st) => (
                        <li key={st.i}>
                          {st.i + 1}. {automationActions[st.action] ?? st.action} — <span className={st.result === "error" ? "text-red-700" : st.result === "deferred" ? "text-amber-800" : ""}>{stepResultLabels[st.result]}</span>
                          {st.note ? `: ${st.note}` : ""}
                        </li>
                      ))}
                      {r.details.error && !r.details.steps.some((st) => st.result === "error") ? <li className="text-red-700">Ошибка: {r.details.error}</li> : null}
                    </ol>
                  ) : (
                    <div className="text-xs text-muted">{r.status === "done" ? "подробностей нет (до журнала или старше 90 дней)" : "подробностей нет"}</div>
                  )}
                </div>
                {r.details && (r.status === "error" || stale) ? <RetryRun runId={r.id} /> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Правило ещё не срабатывало.</p>
      )}
    </div>
  );
}
