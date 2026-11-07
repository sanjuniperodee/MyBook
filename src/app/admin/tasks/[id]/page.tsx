import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, ChevronRight, Handshake, MessagesSquare, Package, UserRound } from "lucide-react";
import { requireStaff } from "@/server/access";
import { loadTaskDetail } from "../task-detail";
import { pageId } from "@/server/input";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/class-names";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { TaskRows } from "../TaskRows";

export const metadata = { title: "Задача" };

/** Строка связанной записи в правой колонке: значок, подпись и содержимое; вся строка — ссылка, если есть куда идти. */
function Linked({ href, icon: Icon, label, children, aside }: { href?: string; icon: typeof UserRound; label: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const body = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.8} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
          <span>{label}</span>
          {aside}
        </div>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
      {href ? <ChevronRight className="mt-1 size-4 shrink-0 text-muted" aria-hidden /> : null}
    </>
  );
  const cls = "flex items-start gap-3 px-4 py-3";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-sunken/60")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * Карточка задачи — «Разворот» (DESIGN.md §7.2): слева сама задача (правится на месте, как в очереди, «Подробнее» раскрыто)
 * и другие открытые задачи по сделке, справа — всё, к чему она привязана: сделка с этапом и суммой, клиент, заказ, диалог и
 * последние записи. Отсюда проваливаются в любую из них.
 */
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const d = await loadTaskDetail(staff, pageId((await params).id));
  if (!d) notFound();
  const status = d.task.doneAt ? { tone: "success" as const, label: "выполнена" } : d.task.overdue ? { tone: "danger" as const, label: "просрочена" } : { tone: "neutral" as const, label: "открыта" };
  const who = [d.task.createdBy ? `поставил(а) ${d.task.createdBy}` : null, d.task.assignee ? `ответственный: ${d.task.assignee}` : "ничья"].filter(Boolean).join(", ");
  const hasContext = !!(d.deal || d.client || d.contact.name || d.order || d.chat);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Задача"
        back={{ href: "/admin/tasks", label: "Задачи" }}
        meta={
          <span className="flex flex-wrap items-center gap-3">
            <Badge tone={status.tone}>{status.label}</Badge>
            {d.task.fromBot ? (
              <Badge>
                <Bot className="size-3" aria-hidden /> от бота
              </Badge>
            ) : null}
          </span>
        }
      >
        {who}
      </PageHeader>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4 xl:max-w-[760px]">
          <section className="panel overflow-hidden" data-testid="task-card">
            <TaskRows tasks={[d.row]} staff={d.staff} canAssign={d.canAssign} expanded />
          </section>

          {d.others.length ? (
            <Panel flush title="Другие задачи по сделке" description={`Открытых: ${d.others.length}`}>
              <ul className="divide-y divide-line text-sm">
                {d.others.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/tasks/${o.id}`} className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-sunken/60 sm:px-5">
                      <span className="min-w-0 flex-1 truncate">{o.title}</span>
                      {o.dueAt ? <span className={cn("shrink-0 text-xs tabular-nums", o.overdue ? "font-medium text-danger" : "text-muted")}>{formatDate(o.dueAt, true)}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        {hasContext || d.notes.length ? (
          <aside className="min-w-0 space-y-4 xl:sticky xl:top-[calc(var(--topbar-h)+1rem)] xl:border-l xl:border-line xl:pl-6" aria-label="Связанные записи">
            {hasContext ? (
              <Panel flush title="Связано">
                <div className="divide-y divide-line">
                  {d.deal ? (
                    <Linked
                      href={`/admin/deals/${d.deal.id}`}
                      icon={Handshake}
                      label="Сделка"
                      aside={d.deal.amountLabel ? <span className="font-semibold text-ink tabular-nums">{d.deal.amountLabel}</span> : null}
                    >
                      <div className="font-medium">
                        №{d.deal.number} · {d.deal.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        {d.deal.stage ? (
                          <span className="inline-flex items-center gap-1.5 text-ink-soft">
                            <span className="size-1.5 rounded-full" style={{ background: d.deal.stage.color }} aria-hidden />
                            {d.deal.stage.name}
                          </span>
                        ) : null}
                        <span>{d.deal.assignee ? `ведёт ${d.deal.assignee}` : "без ответственного"}</span>
                        {d.deal.unsorted ? <span>неразобранная заявка</span> : null}
                      </div>
                    </Linked>
                  ) : null}
                  {d.client || d.contact.name ? (
                    <Linked href={d.client ? `/admin/clients/${d.client.id}` : undefined} icon={UserRound} label="Клиент">
                      <div className="font-medium">{d.client?.name || d.contact.name}</div>
                      {d.contact.phone ? <div className="text-xs text-ink-soft tabular-nums">{d.contact.phone}</div> : null}
                      {d.contact.email ? <div className="truncate text-xs text-muted">{d.contact.email}</div> : null}
                    </Linked>
                  ) : null}
                  {d.order ? (
                    <Linked href={`/admin/orders/${d.order.id}`} icon={Package} label="Заказ" aside={d.order.amountLabel ? <span className="tabular-nums">{d.order.amountLabel}</span> : null}>
                      <div className="font-medium">№{d.order.number}</div>
                      {d.order.statusLabel ? <div className="text-xs text-muted">{d.order.statusLabel}</div> : null}
                    </Linked>
                  ) : null}
                  {d.chat ? (
                    <Linked href={`/admin/chats?c=${d.chat.id}`} icon={MessagesSquare} label="Диалог" aside={d.chat.unread ? <span className="count count-alert">{d.chat.unread}</span> : null}>
                      <div className="line-clamp-2 text-ink-soft">{d.chat.preview || "Открыть переписку"}</div>
                    </Linked>
                  ) : null}
                </div>
              </Panel>
            ) : null}

            {d.notes.length ? (
              <Panel
                title="Последние записи"
                actions={
                  d.deal ? (
                    <Link href={`/admin/deals/${d.deal.id}`} className="text-xs text-wine hover:underline">
                      Вся история в сделке
                    </Link>
                  ) : null
                }
              >
                <ul className="space-y-3 text-sm">
                  {d.notes.map((n) => (
                    <li key={n.id}>
                      <div className="text-xs text-muted">
                        {n.author}, {formatDate(n.at, true)}
                      </div>
                      <p className="whitespace-pre-wrap">{n.text}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
