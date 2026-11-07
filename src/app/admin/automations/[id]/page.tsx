import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { container } from "@/server/container";
import { requireStaff } from "@/server/access";
import { uuid } from "@/server/input";
import { formatDate, nowMs } from "@/lib/dates";
import { PageHeader } from "@/components/admin/PageHeader";
import { InlineStats } from "../../analytics/kit";
import { automationActions, automationTriggers } from "@/modules/automation/domain/meta";
import { runStatusLabels, stepResultLabels, RUNS_LIST_LIMIT, type RunStatus } from "@/modules/automation";
import { RetryRun } from "./RetryRun";

export const metadata = { title: "Журнал правила" };

const statusTone: Record<RunStatus, BadgeTone> = {
  done: "success",
  error: "danger",
  deferred: "warning",
  running: "neutral",
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
    <div className="flex flex-col gap-5">
      <PageHeader title={rule.name} back={{ href: "/admin/automations", label: "Автоматизации" }} meta={<Badge tone={rule.active ? "success" : "neutral"} dot>{rule.active ? "работает" : "выключено"}</Badge>}>
        {trigger}, последние {RUNS_LIST_LIMIT} срабатываний. Каждое правило срабатывает для объекта один раз; здесь видно, что сделало каждое действие. Подробности старше 90 дней очищаются.
      </PageHeader>
      {runs.length ? (
        <InlineStats items={(Object.keys(runStatusLabels) as RunStatus[]).filter((st) => counts[st]).map((st) => ({ label: runStatusLabels[st], value: counts[st] ?? 0, tone: st === "error" ? ("danger" as const) : st === "done" ? ("success" as const) : undefined }))} />
      ) : null}
      {runs.length ? (
        <ul className="panel divide-y divide-line overflow-hidden" data-testid="automation-runs">
          {runs.map((r) => {
            const to = target(r.details?.ctx);
            const stale = r.status === "running" && now - r.createdAt.getTime() > 10 * 60_000;
            return (
              <li key={r.id} className="grid gap-x-4 gap-y-2 px-4 py-3 text-sm sm:px-5 lg:grid-cols-[10rem_7rem_minmax(0,1fr)_auto]">
                <div className="text-xs text-muted tabular-nums lg:pt-0.5">{formatDate(r.createdAt, true)}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:block lg:space-y-1">
                  <Badge tone={statusTone[r.status]}>{runStatusLabels[r.status]}</Badge>
                  {to ? (
                    <Link href={to.href} className="block text-xs text-wine hover:underline">
                      {to.label}
                    </Link>
                  ) : null}
                  {r.details?.ctx.occasion ? <span className="block text-xs text-muted">{r.details.ctx.occasion}</span> : null}
                </div>
                <div className="min-w-0">
                  {r.details ? (
                    <ol className="space-y-0.5 text-xs text-ink-soft">
                      {r.details.steps.map((st) => (
                        <li key={st.i}>
                          {st.i + 1}. {automationActions[st.action] ?? st.action} — <span className={st.result === "error" ? "text-danger" : st.result === "deferred" ? "text-warning" : ""}>{stepResultLabels[st.result]}</span>
                          {st.note ? `: ${st.note}` : ""}
                        </li>
                      ))}
                      {r.details.error && !r.details.steps.some((st) => st.result === "error") ? <li className="text-danger">Ошибка: {r.details.error}</li> : null}
                    </ol>
                  ) : (
                    <div className="text-xs text-muted">{r.status === "done" ? "подробностей нет (до журнала или старше 90 дней)" : "подробностей нет"}</div>
                  )}
                </div>
                {r.details && (r.status === "error" || stale) ? <RetryRun runId={r.id} /> : <span className="hidden lg:block" />}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="panel">
          <EmptyState compact icon={History} title="Правило ещё не срабатывало">
            Когда случится событие из правила, здесь появится, что сделало каждое действие.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
