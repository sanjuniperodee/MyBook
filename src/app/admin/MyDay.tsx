import { container } from "@/server/container";
import Link from "next/link";
import { currentMonth } from "@/modules/sales";
import { CalendarX, CheckSquare, Handshake, Inbox, MessagesSquare, PhoneMissed } from "lucide-react";
import { can, canWork, contactView, type Staff } from "@/server/access";
import { formatPrice } from "@/config/site";
import { formatPhone } from "@/shared/domain/phone";
import { channelLabel } from "@/modules/messaging";
import { cn } from "@/lib/class-names";
import { Panel } from "@/components/ui/Panel";
import { formatDate } from "@/lib/dates";
import { getSetting } from "@/modules/workspace";
import { parseWorkHours } from "@/shared/domain/schedule";
import { responseWait, slaMinutes, waitTone } from "@/modules/reporting/ui/response-wait";
import { TaskRows, type TaskRow } from "./tasks/TaskRows";
import { taskContact, taskRow, type Reacher } from "./tasks/task-row";

/**
 * «Мой день» — рабочий стол менеджера: что горит прямо сейчас. Числа на плитках — настоящие, как бейджи меню, а списки
 * под ними — первые несколько. «Сегодня» — задачи с галочкой, «+1 ч» и «Завтра», у звонка — «Позвонить», у «Написать» —
 * WhatsApp и «Открыть чат». Ожидание клиента — в рабочих минутах против норматива из настроек CRM, как в «Чатах».
 */
export async function MyDay({ staff }: { staff: Staff }) {
  const me = staff.user.id;
  const viewer = { userId: me, seesAll: staff.scope === "all" };
  const [{ tasks, waiting, missed, deals, unsorted, counts }, plans, slaRaw, hoursRaw, provider] = await Promise.all([
    container().reporting.myDay(viewer, { chats: can(staff, "chats.view"), calls: can(staff, "calls.view"), deals: can(staff, "deals.view") }),
    container().sales.queries.planProgress(currentMonth(), [me]),
    getSetting("crm.slaMinutes"),
    getSetting("crm.workHours"),
    can(staff, "calls.make") ? container().telephony.phone.currentProvider() : null,
  ]);
  const plan = plans.get(me);
  const now = new Date();
  const sla = slaMinutes(slaRaw);
  const hours = parseWorkHours(hoursRaw);
  // Звонок через АТС — только с подключённой Zadarma и внутренним номером сотрудника, и у каждой задачи — только если её
  // сделку (заказ, клиента) ведёт этот сотрудник: «ничья» задача бота на неразобранной сделке у роли «только свои» — без
  // АТС и «Открыть чат» (сервер откажет), «Позвонить» — ссылка tel:. Номер для tel: и wa.me — только тому, кому видны контакты.
  const reacher: Reacher = {
    phoneVisible: can(staff, "clients.contacts"),
    works: (assigneeId) => canWork(staff, assigneeId),
    pbx: provider === "zadarma" && !!staff.user.sipExtension,
    chat: can(staff, "chats.send"),
  };
  const today: TaskRow[] = tasks.map((r) => ({ ...taskRow(r, { userId: me, allTasks: can(staff, "tasks.all") }, now), contact: taskContact(r, reacher) }));
  const tiles = [
    unsorted.n > 0 && { href: "/admin/deals", icon: Inbox, label: "Неразобранные заявки", value: String(unsorted.n), hot: true },
    { href: "/admin/tasks", icon: CheckSquare, label: counts.overdueTasks ? `Задачи на сегодня, просрочено ${counts.overdueTasks}` : "Задачи на сегодня", value: String(counts.tasks), hot: counts.overdueTasks > 0 },
    can(staff, "chats.view") && { href: "/admin/chats?f=waiting", icon: MessagesSquare, label: "Ждут ответа", value: String(counts.waiting), hot: counts.waiting > 0 },
    can(staff, "calls.view") && { href: "/admin/calls?f=missed", icon: PhoneMissed, label: "Пропущенные звонки", value: String(counts.missed), hot: counts.missed > 0 },
    can(staff, "deals.view") && { href: "/admin/deals?mine=1", icon: Handshake, label: deals.sum ? `Мои сделки в работе на ${formatPrice(deals.sum)}` : "Мои сделки в работе", value: String(deals.n), hot: false },
    // Тот же NOT EXISTS, что фильтр сделок «Без задачи»: открытая сделка без открытой задачи.
    can(staff, "deals.view") && { href: "/admin/deals?mine=1&task=none", icon: CalendarX, label: "Мои сделки без следующего шага", value: String(deals.noNextStep), hot: deals.noNextStep > 0 },
  ].filter(Boolean) as { href: string; icon: typeof CheckSquare; label: string; value: string; hot: boolean }[];

  return (
    <div className="space-y-4" data-testid="my-day">
      {/* «Сейчас»: что требует действия — одним листом, ячейки-ссылки; горящее — винным числом и точкой. */}
      <section aria-label="Сейчас" className="flex flex-wrap gap-px overflow-hidden rounded-[14px] border border-line bg-line">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group flex min-h-24 flex-[1_1_9.5rem] flex-col justify-between gap-3 bg-white p-4 transition-colors hover:bg-sunken/60">
            <span className="flex items-center justify-between gap-2 text-muted">
              <t.icon className="size-4" strokeWidth={1.8} aria-hidden />
              {t.hot ? <span className="size-2 rounded-full bg-wine" aria-label="требует внимания" /> : null}
            </span>
            <span>
              <span className={cn("block text-[22px] leading-tight font-semibold tabular-nums", t.hot && "text-wine")}>{t.value}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft group-hover:text-ink">{t.label}</span>
            </span>
          </Link>
        ))}
      </section>
      {plan?.planAmount ? (
        <section className="panel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3.5 sm:px-5" data-testid="my-plan">
          <span className="text-sm font-medium">План на месяц</span>
          <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-sunken">
            <div className={cn("h-full rounded-full", plan.factAmount >= plan.planAmount ? "bg-success" : "bg-wine")} style={{ width: `${Math.min(100, (plan.factAmount / plan.planAmount) * 100)}%` }} />
          </div>
          <span className="text-sm tabular-nums">
            <b className="font-semibold">{formatPrice(plan.factAmount)}</b> <span className="text-muted">из {formatPrice(plan.planAmount)}</span> <span className="badge ml-1">{Math.round((plan.factAmount / plan.planAmount) * 100)}%</span>
            {plan.planDeals ? <span className="ml-2 text-muted">сделок {plan.factDeals} из {plan.planDeals}</span> : null}
          </span>
        </section>
      ) : null}
      {today.length ? (
        <Panel
          flush
          title={
            <>
              Задачи на сегодня <span className="font-normal text-muted tabular-nums">{counts.tasks}</span>
              {counts.overdueTasks ? <span className="badge badge-danger ml-2 align-middle">просрочено {counts.overdueTasks}</span> : null}
            </>
          }
          actions={
            <Link href="/admin/tasks" className="btn btn-ghost btn-sm">
              Все задачи
            </Link>
          }
        >
          <div className="px-4 sm:px-5" data-testid="my-day-tasks">
            <TaskRows tasks={today} staff={[]} canAssign={false} compact />
          </div>
          {counts.tasks > today.length ? (
            <p className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
              Показаны первые {today.length} из {counts.tasks}.{" "}
              <Link href="/admin/tasks" className="text-wine hover:underline">
                Открыть все задачи
              </Link>
            </p>
          ) : null}
        </Panel>
      ) : null}
      {waiting.length || missed.length ? (
        <div className={cn("grid gap-4", waiting.length && missed.length && "lg:grid-cols-2")}>
          {waiting.length ? (
            <Panel flush title={<>Клиенты ждут ответа {counts.waiting > waiting.length ? <span className="font-normal text-muted tabular-nums">{counts.waiting}</span> : null}</>} actions={<Link href="/admin/chats?f=waiting" className="btn btn-ghost btn-sm">В чаты</Link>}>
              <ul className="divide-y divide-line">
                {waiting.map((c) => {
                  const wait = responseWait(c.awaitingSince!, now, hours, sla);
                  return (
                    <li key={c.id}>
                      <Link href={`/admin/chats?c=${c.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.contactName || contactView(staff, { phone: formatPhone(c.chatId) }).phone}</span>
                          <span className="block truncate text-xs text-muted">
                            {channelLabel(c.channel)}: {c.lastMessageText}
                          </span>
                        </span>
                        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums", waitTone(wait.overdue))} title={`Норматив ответа — ${sla} рабочих минут`}>
                          ждёт {wait.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}
          {missed.length ? (
            <Panel flush title={<>Перезвонить {counts.missed > missed.length ? <span className="font-normal text-muted tabular-nums">{counts.missed}</span> : null}</>} actions={<Link href="/admin/calls?f=missed" className="btn btn-ghost btn-sm">Звонки</Link>}>
              <ul className="divide-y divide-line">
                {missed.map((c) => (
                  <li key={c.id}>
                    <Link href={c.dealId ? `/admin/deals/${c.dealId}` : "/admin/calls?f=missed"} className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                      <PhoneMissed className="size-4 shrink-0 text-danger" aria-hidden />
                      <span className="flex-1 tabular-nums">{contactView(staff, { phone: formatPhone(c.clientPhone) }).phone || "скрытый номер"}</span>
                      <span className="text-xs text-muted">{formatDate(c.startedAt, true)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
