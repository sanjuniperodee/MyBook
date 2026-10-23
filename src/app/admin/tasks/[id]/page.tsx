import Link from "next/link";
import { BackLink } from "@/components/admin/BackLink";
import { notFound } from "next/navigation";
import { Bot, Handshake, MessagesSquare, Package, StickyNote, UserRound } from "lucide-react";
import { requireStaff } from "@/server/access";
import { loadTaskDetail } from "../task-detail";
import { pageId } from "@/server/input";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/class-names";
import { TaskRows } from "../TaskRows";

export const metadata = { title: "Задача" };

/**
 * Карточка задачи: сама задача (правится на месте, как в списке) и всё, к чему она привязана, — сделка с этапом и суммой,
 * клиент, заказ, диалог, последние записи и другие открытые задачи по сделке. Отсюда проваливаются в любую из них.
 */
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const d = await loadTaskDetail(staff, pageId((await params).id));
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/admin/tasks">Задачи</BackLink>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {d.task.fromBot ? (
          <span className="inline-flex items-center gap-1 rounded bg-cream px-1.5 py-0.5 text-ink-soft">
            <Bot className="size-3" /> от бота
          </span>
        ) : null}
        <span>{[d.task.createdBy ? `поставил(а) ${d.task.createdBy}` : null, d.task.assignee ? `ответственный: ${d.task.assignee}` : "ничья"].filter(Boolean).join(" · ")}</span>
      </div>

      <section className="rounded-2xl border border-line bg-white px-4 py-1" data-testid="task-card">
        <TaskRows tasks={[d.row]} staff={d.staff} canAssign={d.canAssign} />
      </section>

      {d.deal ? (
        <Link href={`/admin/deals/${d.deal.id}`} className="block rounded-2xl border border-line bg-white p-4 transition hover:border-wine/30 hover:shadow-soft">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
            <Handshake className="size-3.5" /> Сделка
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">
              №{d.deal.number} · {d.deal.title}
            </span>
            {d.deal.stage ? (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ background: d.deal.stage.color }}>
                {d.deal.stage.name}
              </span>
            ) : null}
            {d.deal.amountLabel ? <span className="ml-auto font-semibold tabular-nums">{d.deal.amountLabel}</span> : null}
          </div>
          <div className="mt-1.5 text-xs text-muted">
            {d.deal.source}
            {d.deal.assignee ? ` · ведёт ${d.deal.assignee}` : " · без ответственного"}
            {d.deal.unsorted ? " · неразобранная заявка" : ""}
          </div>
        </Link>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {d.client || d.contact.name ? (
          <section className="rounded-2xl border border-line bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
              <UserRound className="size-3.5" /> Клиент
            </div>
            <div className="font-semibold">{d.client?.name || d.contact.name}</div>
            {d.contact.phone ? <div className="mt-0.5 text-sm text-ink-soft">{d.contact.phone}</div> : null}
            {d.contact.email ? <div className="text-xs text-muted">{d.contact.email}</div> : null}
            {d.client ? (
              <Link href={`/admin/clients/${d.client.id}`} className="mt-2 inline-block text-sm text-wine hover:underline">
                Карточка клиента →
              </Link>
            ) : null}
          </section>
        ) : null}
        {d.order ? (
          <Link href={`/admin/orders/${d.order.id}`} className="rounded-2xl border border-line bg-white p-4 transition hover:border-wine/30 hover:shadow-soft">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
              <Package className="size-3.5" /> Заказ
            </div>
            <div className="font-semibold">№{d.order.number}</div>
            <div className="mt-0.5 text-sm text-ink-soft">{[d.order.statusLabel, d.order.amountLabel].filter(Boolean).join(" · ")}</div>
          </Link>
        ) : null}
        {d.chat ? (
          <Link href={`/admin/chats?c=${d.chat.id}`} className="rounded-2xl border border-line bg-white p-4 transition hover:border-wine/30 hover:shadow-soft">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
              <MessagesSquare className="size-3.5" /> Диалог
              {d.chat.unread ? <span className="rounded-full bg-wine px-1.5 text-[10px] text-white">{d.chat.unread}</span> : null}
            </div>
            <div className="line-clamp-2 text-sm text-ink-soft">{d.chat.preview || "Открыть переписку"}</div>
          </Link>
        ) : null}
      </div>

      {d.others.length ? (
        <section className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Другие задачи по сделке</h2>
          <ul className="divide-y divide-line text-sm">
            {d.others.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/tasks/${o.id}`} className="flex items-center gap-3 py-2 hover:text-wine">
                  <span className="min-w-0 flex-1 truncate">{o.title}</span>
                  {o.dueAt ? <span className={cn("shrink-0 text-xs", o.overdue ? "font-medium text-red-700" : "text-muted")}>{formatDate(o.dueAt, true)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {d.notes.length ? (
        <section className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
            <StickyNote className="size-3.5" /> Последние записи
          </h2>
          <ul className="space-y-3 text-sm">
            {d.notes.map((n) => (
              <li key={n.id}>
                <div className="text-xs text-muted">
                  {n.author} · {formatDate(n.at, true)}
                </div>
                <p className="whitespace-pre-wrap">{n.text}</p>
              </li>
            ))}
          </ul>
          {d.deal ? (
            <Link href={`/admin/deals/${d.deal.id}`} className="mt-3 inline-block text-sm text-wine hover:underline">
              Вся история в сделке →
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
