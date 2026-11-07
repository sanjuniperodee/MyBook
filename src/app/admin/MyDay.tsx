import { container } from "@/server/container";
import Link from "next/link";
import { currentMonth } from "@/modules/sales";
import { CircleCheck, PhoneMissed } from "lucide-react";
import { can, canWork, contactView, type Staff } from "@/server/access";
import { formatPrice } from "@/config/site";
import { formatPhone } from "@/shared/domain/phone";
import { channelLabel } from "@/modules/messaging";
import { cn } from "@/lib/class-names";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/dates";
import { getSetting } from "@/modules/workspace";
import { parseWorkHours } from "@/shared/domain/schedule";
import { responseWait, slaMinutes } from "@/modules/reporting/ui/response-wait";
import { TaskRows, type TaskRow } from "./tasks/TaskRows";
import { taskContact, taskRow, type Reacher } from "./tasks/task-row";

/**
 * «Мой день» — рабочее место менеджера: что горит прямо сейчас. Данные одни, а блоков четыре, чтобы страница сама решала,
 * где их разместить: «Сейчас» (строка чисел-ссылок), план месяца, «Ответить» (клиенты ждут, пропущенные звонки) и задачи
 * на сегодня. Числа — настоящие, как значки разделов. Ожидание клиента — в рабочих минутах против норматива из настроек
 * CRM, как в «Чатах». У задач: галочка, «+1 ч» и «Завтра», у звонка — «Позвонить», у «Написать» — WhatsApp и «Открыть чат».
 */
export async function myDayParts(staff: Staff) {
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
  const figures = [
    unsorted.n > 0 && { href: "/admin/deals", label: "Неразобранные заявки", value: String(unsorted.n), hot: true },
    { href: "/admin/tasks", label: counts.overdueTasks ? `Задачи на сегодня, просрочено ${counts.overdueTasks}` : "Задачи на сегодня", value: String(counts.tasks), hot: counts.overdueTasks > 0 },
    can(staff, "chats.view") && { href: "/admin/chats?f=waiting", label: "Ждут ответа", value: String(counts.waiting), hot: counts.waiting > 0 },
    can(staff, "calls.view") && { href: "/admin/calls?f=missed", label: "Пропущенные звонки", value: String(counts.missed), hot: counts.missed > 0 },
    can(staff, "deals.view") && { href: "/admin/deals?mine=1", label: deals.sum ? `Мои сделки в работе на ${formatPrice(deals.sum)}` : "Мои сделки в работе", value: String(deals.n), hot: false },
    // Тот же NOT EXISTS, что фильтр сделок «Без задачи»: открытая сделка без открытой задачи.
    can(staff, "deals.view") && { href: "/admin/deals?mine=1&task=none", label: "Мои сделки без следующего шага", value: String(deals.noNextStep), hot: deals.noNextStep > 0 },
  ].filter(Boolean) as { href: string; label: string; value: string; hot: boolean }[];

  const strip = (
    <section aria-label="Сейчас" className="flex flex-wrap gap-px overflow-hidden rounded-[var(--r-panel)] border border-line bg-line">
      {figures.map((t) => (
        <Link key={t.href} href={t.href} className="group relative flex min-h-[5.25rem] flex-[1_1_9.5rem] flex-col justify-between gap-2 bg-white px-4 py-3.5 transition-colors hover:bg-sunken/60">
          <span className={cn("text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums", t.hot ? "text-wine" : "text-ink")}>{t.value}</span>
          <span className="text-[13px] leading-snug text-muted group-hover:text-ink-soft">{t.label}</span>
          {t.hot ? <span className="absolute top-3 right-3 size-2 rounded-full bg-wine" aria-label="требует внимания" /> : null}
        </Link>
      ))}
    </section>
  );

  const planBlock = plan?.planAmount ? (
    <section className="panel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-5" data-testid="my-plan">
      <span className="text-sm font-semibold">План на месяц</span>
      <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-sunken">
        <div className={cn("h-full rounded-full", plan.factAmount >= plan.planAmount ? "bg-success" : "bg-wine")} style={{ width: `${Math.min(100, (plan.factAmount / plan.planAmount) * 100)}%` }} />
      </div>
      <span className="text-sm tabular-nums">
        <b className="font-semibold">{formatPrice(plan.factAmount)}</b> <span className="text-muted">из {formatPrice(plan.planAmount)}</span> <span className="count ml-1">{Math.round((plan.factAmount / plan.planAmount) * 100)}%</span>
        {plan.planDeals ? <span className="ml-2 text-muted">сделок {plan.factDeals} из {plan.planDeals}</span> : null}
      </span>
    </section>
  ) : null;

  const tasksBlock = today.length ? (
    <Panel
      flush
      title={
        <>
          Задачи на сегодня <span className="font-normal text-muted tabular-nums">{counts.tasks}</span>
          {counts.overdueTasks ? <span className="badge badge-danger ml-3 align-middle">просрочено {counts.overdueTasks}</span> : null}
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
  ) : null;

  const groupHead = "flex items-center justify-between gap-2 bg-sunken/60 px-4 py-1.5 text-xs font-medium text-muted sm:px-5";
  const queue =
    waiting.length || missed.length ? (
      <Panel flush title="Ответить" actions={<Link href="/admin/chats?f=waiting" className="btn btn-ghost btn-sm">В чаты</Link>}>
        {waiting.length ? (
          <>
            <div className={groupHead}>
              <span>Клиенты ждут ответа</span>
              <span className="tabular-nums">{counts.waiting}</span>
            </div>
            <ul className="divide-y divide-line">
              {waiting.map((c) => {
                const wait = responseWait(c.awaitingSince!, now, hours, sla);
                const name = c.contactName || contactView(staff, { phone: formatPhone(c.chatId) }).phone;
                return (
                  <li key={c.id}>
                    <Link href={`/admin/chats?c=${c.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken/60 sm:px-5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-[13px] font-semibold text-ink-soft uppercase" aria-hidden>
                        {(name || "?").slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="block truncate text-xs text-muted">
                          {channelLabel(c.channel)}: {c.lastMessageText}
                        </span>
                      </span>
                      <span className={cn("badge shrink-0 tabular-nums", wait.overdue ? "badge-danger" : "badge-warning")} title={`Норматив ответа — ${sla} рабочих минут`}>
                        {wait.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        {missed.length ? (
          <>
            <div className={cn(groupHead, waiting.length && "border-t border-line")}>
              <span>Перезвонить</span>
              <span className="tabular-nums">{counts.missed}</span>
            </div>
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
          </>
        ) : null}
      </Panel>
    ) : (
      <Panel title="Ответить">
        <EmptyState compact icon={CircleCheck} title="Все клиенты отвечены">
          Здесь появятся диалоги, в которых клиент ждёт ответа дольше норматива, и пропущенные звонки.
        </EmptyState>
      </Panel>
    );

  return { strip, plan: planBlock, tasks: tasksBlock, queue };
}

/** «Мой день» целиком — страница сотрудника без доступа к аналитике: числа, план, затем задачи и очередь двумя колонками. */
export async function MyDay({ staff }: { staff: Staff }) {
  const p = await myDayParts(staff);
  return (
    <div className="flex flex-col gap-5" data-testid="my-day">
      {p.strip}
      {p.plan}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-5 xl:order-2">{p.queue}</div>
        <div className="flex min-w-0 flex-col gap-5 xl:order-1">{p.tasks}</div>
      </div>
    </div>
  );
}
