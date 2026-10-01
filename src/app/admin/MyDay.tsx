import Link from "next/link";
import { currentMonth, planProgress } from "@/lib/crm/plans";
import { and, asc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { CheckSquare, Handshake, Inbox, MessagesSquare, PhoneMissed } from "lucide-react";
import { db } from "@/lib/db";
import { crmCalls, crmConversations, crmDeals, crmStages, crmTasks } from "@/lib/db/schema";
import { can, contactView, ownScope, type Staff } from "@/server/access";
import { formatPrice } from "@/config/site";
import { formatPhone } from "@/lib/crm/phone";
import { channelLabel } from "@/lib/crm/chats";
import { cn, formatDate } from "@/lib/utils";

const minutesAgo = (d: Date) => Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
const waitLabel = (m: number) => (m < 60 ? `${m} мин` : m < 1440 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${Math.floor(m / 1440)} дн`);

/** «Мой день» — рабочий стол менеджера: что горит прямо сейчас. */
export async function MyDay({ staff }: { staff: Staff }) {
  const me = staff.user.id;
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const none = Promise.resolve([]);
  const [tasks, waiting, missed, [deals], [unsorted], plans] = await Promise.all([
    db
      .select()
      .from(crmTasks)
      .where(and(isNull(crmTasks.doneAt), lte(crmTasks.dueAt, endOfDay), or(eq(crmTasks.assigneeId, me), isNull(crmTasks.assigneeId))))
      .orderBy(asc(crmTasks.dueAt))
      .limit(8),
    can(staff, "chats.view")
      ? db
          .select()
          .from(crmConversations)
          .where(and(isNotNull(crmConversations.awaitingSince), eq(crmConversations.status, "open"), ownScope(staff, crmConversations.assigneeId)))
          .orderBy(asc(crmConversations.awaitingSince))
          .limit(6)
      : none,
    can(staff, "calls.view")
      ? db
          .select()
          .from(crmCalls)
          .where(and(eq(crmCalls.status, "missed"), eq(crmCalls.direction, "in"), isNull(crmCalls.handledAt), gte(crmCalls.startedAt, sql`now() - interval '3 days'`), ownScope(staff, crmCalls.staffId)))
          .orderBy(asc(crmCalls.startedAt))
          .limit(6)
      : none,
    can(staff, "deals.view")
      ? db
          .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${crmDeals.amount}), 0)::int` })
          .from(crmDeals)
          .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
          .where(and(eq(crmStages.kind, "open"), eq(crmDeals.assigneeId, me)))
      : Promise.resolve([{ n: 0, sum: 0 }]),
    can(staff, "deals.view")
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(crmDeals)
          .where(and(eq(crmDeals.unsorted, true), ownScope(staff, crmDeals.assigneeId)))
      : Promise.resolve([{ n: 0 }]),
    planProgress(currentMonth(), [me]),
  ]);
  const plan = plans.get(me);
  const now = new Date();
  const tiles = [
    unsorted.n > 0 && { href: "/admin/deals", icon: Inbox, label: "Неразобранные заявки", value: String(unsorted.n), hot: true },
    { href: "/admin/tasks", icon: CheckSquare, label: "Задачи на сегодня", value: String(tasks.length), hot: tasks.some((t) => t.dueAt && t.dueAt < now) },
    can(staff, "chats.view") && { href: "/admin/chats?f=waiting", icon: MessagesSquare, label: "Ждут ответа", value: String(waiting.length), hot: waiting.length > 0 },
    can(staff, "calls.view") && { href: "/admin/calls?f=missed", icon: PhoneMissed, label: "Пропущенные звонки", value: String(missed.length), hot: missed.length > 0 },
    can(staff, "deals.view") && { href: "/admin/deals?mine=1", icon: Handshake, label: "Мои сделки в работе", value: `${deals.n}${deals.sum ? ` · ${formatPrice(deals.sum)}` : ""}`, hot: false },
  ].filter(Boolean) as { href: string; icon: typeof CheckSquare; label: string; value: string; hot: boolean }[];

  return (
    <div className="space-y-4" data-testid="my-day">
      {plan?.planAmount ? (
        <div className="rounded-2xl border border-line bg-white p-4" data-testid="my-plan">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">План на месяц</span>
            <span className="tabular-nums">
              {formatPrice(plan.factAmount)} из {formatPrice(plan.planAmount)} · <b>{Math.round((plan.factAmount / plan.planAmount) * 100)}%</b>
              {plan.planDeals ? <span className="text-muted"> · сделок {plan.factDeals} из {plan.planDeals}</span> : null}
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-cream">
            <div className={cn("h-full rounded-full", plan.factAmount >= plan.planAmount ? "bg-emerald-600" : "bg-wine")} style={{ width: `${Math.min(100, (plan.factAmount / plan.planAmount) * 100)}%` }} />
          </div>
        </div>
      ) : null}
      <div className={cn("grid gap-3 sm:grid-cols-2", tiles.length > 4 ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className={cn("flex items-center gap-3 rounded-2xl border bg-white p-4 transition hover:shadow-soft", t.hot ? "border-wine/30" : "border-line")}>
            <span className={cn("flex size-10 items-center justify-center rounded-xl", t.hot ? "bg-rose text-wine" : "bg-cream text-ink-soft")}>
              <t.icon className="size-5" />
            </span>
            <span>
              <span className="block text-lg font-semibold tabular-nums">{t.value}</span>
              <span className="text-xs text-muted">{t.label}</span>
            </span>
          </Link>
        ))}
      </div>
      {waiting.length || missed.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {waiting.length ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Клиенты ждут ответа</h2>
              <div className="divide-y divide-line">
                {waiting.map((c) => {
                  const m = minutesAgo(c.awaitingSince!);
                  return (
                    <Link key={c.id} href={`/admin/chats?c=${c.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-cream/40">
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{c.contactName || contactView(staff, { phone: formatPhone(c.chatId) }).phone}</span>
                        <span className="text-muted"> · {channelLabel(c.channel)} · {c.lastMessageText}</span>
                      </span>
                      <span className={cn("shrink-0 text-xs tabular-nums", m >= 15 ? "font-semibold text-red-700" : "text-muted")}>{waitLabel(m)}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
          {missed.length ? (
            <section className="overflow-hidden rounded-2xl border border-line bg-white">
              <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Перезвонить</h2>
              <div className="divide-y divide-line">
                {missed.map((c) => (
                  <Link key={c.id} href={c.dealId ? `/admin/deals/${c.dealId}` : "/admin/calls?f=missed"} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-cream/40">
                    <PhoneMissed className="size-4 text-red-600" />
                    <span className="flex-1 tabular-nums">{contactView(staff, { phone: formatPhone(c.clientPhone) }).phone || "скрытый номер"}</span>
                    <span className="text-xs text-muted">{formatDate(c.startedAt, true)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
