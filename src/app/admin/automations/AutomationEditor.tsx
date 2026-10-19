"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Plus, Trash2, X, Zap } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { automationActions, automationHours, automationTriggers, orderRuleStatuses, type AutomationActionType } from "@/modules/automation/domain/meta";
import { ruleTemplateVars } from "@/shared/domain/templates";
import { isStaffOnlyTrigger, isTransactionalTrigger } from "@/modules/automation/domain/rules";
import { orderStatusLabel } from "@/modules/ordering/ui/status";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import type { RuleAction as AutomationAction } from "@/modules/automation/domain";
import { ANNIVERSARY_DEFAULTS, ANNIVERSARY_LIMITS } from "@/modules/automation/domain/anniversary";
import { EVENT_DATE_DEFAULTS, EVENT_DATE_LIMITS } from "@/modules/automation/domain/eventDate";
import { IDLE_DEFAULTS, IDLE_LIMITS } from "@/modules/automation/domain/idle";
import { SILENT_DEFAULTS, SILENT_LIMITS } from "@/modules/automation/domain/silent";
import { cn } from "@/lib/class-names";
import { deleteAutomationAction, saveAutomationAction, toggleAutomationAction } from "./actions";

interface Rule {
  id: string;
  name: string;
  trigger: string;
  conditions: Record<string, string | number | null>;
  actions: AutomationAction[];
  active: boolean;
}
interface Ctx {
  /** open — этап в работе (не «успех» и не «отказ»): «Сделка без активности» берёт только такие. */
  stages: { id: string; name: string; open?: boolean }[];
  staff: { id: string; label: string }[];
  /** Праздники из «Интеграции» → CRM — для правила «Приближается праздник». */
  holidays: { id: string; label: string }[];
}

const blank = (type: AutomationActionType): AutomationAction =>
  type === "create_task" ? { type, title: "", dueMinutes: 60, userId: null } : type === "create_deal" ? { type, title: "", userId: null } : type === "send_message" || type === "draft_message" ? { type, text: "", textKk: "" } : type === "notify" ? { type, title: "", text: "", userId: null } : type === "move_stage" ? { type, stageId: "" } : { type, userId: null };

function describe(r: Rule, ctx: Ctx) {
  const t = automationTriggers[r.trigger as keyof typeof automationTriggers]?.label ?? r.trigger;
  const cond =
    (r.conditions.stageId ? ` «${ctx.stages.find((s) => s.id === r.conditions.stageId)?.name ?? "?"}»` : "") +
    (r.conditions.orderStatus ? ` «${orderStatusLabel(String(r.conditions.orderStatus))}»` : "") +
    (r.conditions.minutes ? ` ${r.conditions.minutes} мин` : "") +
    (r.conditions.silentHours ? ` ${r.conditions.silentHours} ч` : "") +
    (r.conditions.days ? ` ${r.conditions.days} дн.` : "") +
    (r.conditions.holiday ? ` «${ctx.holidays.find((h) => h.id === r.conditions.holiday)?.label ?? r.conditions.holiday}»` : "") +
    (r.conditions.daysBefore ? ` за ${r.conditions.daysBefore} дн.` : "") +
    (r.conditions.windowDays
      ? r.trigger === "occasion.anniversary"
        ? `, кроме купивших снова за ${Number(r.conditions.daysBefore ?? ANNIVERSARY_DEFAULTS.daysBefore) + Number(r.conditions.windowDays)} дн. до неё`
        : `, покупали за ${r.conditions.windowDays} дн. до него`
      : "") +
    (r.conditions.perDay ? `, до ${r.conditions.perDay} в день` : "") +
    (r.conditions.bookBelow ? `, книга заполнена меньше ${r.conditions.bookBelow}%` : "") +
    (r.conditions.unpaid ? ", ничего не оплачено" : "") +
    (r.conditions.source ? ` (${dealSourceLabels[r.conditions.source as keyof typeof dealSourceLabels] ?? r.conditions.source})` : "") +
    (r.conditions.hours ? ` · ${automationHours[r.conditions.hours as keyof typeof automationHours]}` : "");
  return { trigger: t + cond, actions: r.actions.map((a) => automationActions[a.type]).join(", ") };
}

export function AutomationCard({ rule, stats, ctx }: { rule: Rule | null; stats: { runs: number; last: string | null; sales?: string | null } | null; ctx: Ctx }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (!rule && !editing)
    return (
      <button onClick={() => setEditing(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-6 text-sm text-muted hover:border-wine/40 hover:text-wine">
        <Plus className="size-4" /> Новое правило
      </button>
    );
  if (editing || !rule) return <Editor rule={rule} ctx={ctx} onClose={() => setEditing(false)} />;
  const d = describe(rule, ctx);
  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-white p-4", !rule.active && "opacity-60")} data-testid="automation">
      <span className={cn("flex size-10 items-center justify-center rounded-xl", rule.active ? "bg-rose text-wine" : "bg-cream text-muted")}>
        <Zap className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{rule.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="rounded bg-cream px-1.5 py-0.5 text-ink-soft">{d.trigger}</span>
          <ArrowRight className="size-3" />
          <span>{d.actions}</span>
        </div>
        {stats ? (
          <div className="mt-1 text-[11px] text-muted">
            сработало {stats.runs} раз{stats.last ? ` · последний ${stats.last}` : ""}
          </div>
        ) : null}
        {stats?.sales ? (
          <div className="mt-0.5 text-[11px] text-emerald-800" data-testid="automation-sales">
            {stats.sales}
          </div>
        ) : null}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          className="size-4 accent-wine"
          checked={rule.active}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            start(() => toggleAutomationAction(rule.id, v));
          }}
        />
        {rule.active ? "включено" : "выключено"}
      </label>
      <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
        Изменить
      </button>
      <button className="text-muted hover:text-red-700" disabled={pending} onClick={async () => (await ask(`Удалить правило «${rule.name}»?`, true)) && start(() => deleteAutomationAction(rule.id))} aria-label="Удалить">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function Editor({ rule, ctx, onClose }: { rule: Rule | null; ctx: Ctx; onClose: () => void }) {
  const [name, setName] = useState(rule?.name ?? "");
  const [trigger, setTrigger] = useState(rule?.trigger ?? "deal.created");
  const [conditions, setConditions] = useState<Record<string, string | number | null>>(rule?.conditions ?? {});
  // «Книга заполнена меньше»: включено, пока порог не null — и когда поле стёрли, чтобы набрать другое число («»), а не 0.
  const bookCheck = conditions.bookBelow !== null && conditions.bookBelow !== undefined;
  const [actions, setActions] = useState<AutomationAction[]>(rule?.actions ?? [blank("create_task")]);
  const [pending, start] = useTransition();
  const setAction = (i: number, patch: Partial<AutomationAction>) => setActions((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const staffSelect = (value: string | null | undefined, onChange: (v: string | null) => void, emptyLabel: string) => (
    <select className="input h-9 text-sm" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {ctx.staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );

  const save = () =>
    start(async () => {
      try {
        const r = await saveAutomationAction({ id: rule?.id ?? null, name, trigger: trigger as never, conditions: conditions as never, actions: actions as never, active: rule?.active ?? true });
        toast(r.message, r.ok ? "success" : "error");
        if (r.ok) onClose();
      } catch (e) {
        toastError(e);
      }
    });

  return (
    <div className="space-y-4 rounded-2xl border border-wine/30 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название правила" maxLength={100} className="input h-10 flex-1 font-medium" />
        <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Закрыть">
          <X className="size-5" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted uppercase">Когда</span>
          <select className="input h-10 text-sm" value={trigger} onChange={(e) => setTrigger(e.target.value)} aria-label="Событие">
            {Object.entries(automationTriggers).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">{automationTriggers[trigger as keyof typeof automationTriggers]?.hint}</span>
        </label>
        <div>
          <span className="mb-1 block text-xs font-semibold text-muted uppercase">Условие</span>
          {trigger === "deal.stage_changed" ? (
            <select className="input h-10 text-sm" value={String(conditions.stageId ?? "")} onChange={(e) => setConditions({ hours: conditions.hours ?? null, stageId: e.target.value || null })}>
              <option value="">любой этап</option>
              {ctx.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : trigger === "deal.created" ? (
            <select className="input h-10 text-sm" value={String(conditions.source ?? "")} onChange={(e) => setConditions({ hours: conditions.hours ?? null, source: e.target.value || null })}>
              <option value="">любой источник</option>
              {dealSources.map((s) => (
                <option key={s} value={s}>
                  {dealSourceLabels[s]}
                </option>
              ))}
            </select>
          ) : trigger === "order.status_changed" ? (
            <select className="input h-10 text-sm" value={String(conditions.orderStatus ?? "")} onChange={(e) => setConditions({ hours: conditions.hours ?? null, orderStatus: e.target.value || null })} aria-label="Статус заказа">
              <option value="">любой статус</option>
              {orderRuleStatuses.map((s) => (
                <option key={s} value={s}>
                  {orderStatusLabel(s)}
                </option>
              ))}
            </select>
          ) : trigger === "message.unanswered" ? (
            <label className="flex items-center gap-2 text-sm">
              дольше
              <input type="number" min={1} max={1440} className="input h-10 w-24 text-sm" value={Number(conditions.minutes ?? 15)} onChange={(e) => setConditions({ ...conditions, minutes: Number(e.target.value) })} />
              рабочих минут
            </label>
          ) : trigger === "message.silent" ? (
            <label className="flex items-center gap-2 text-sm" title="Часы — календарные. Ответ старше недели после порога правило не берёт">
              клиент молчит
              <input
                type="number"
                min={1}
                max={SILENT_LIMITS.hours}
                className="input h-10 w-24 text-sm"
                value={Number(conditions.silentHours ?? SILENT_DEFAULTS.hours)}
                onChange={(e) => setConditions({ ...conditions, silentHours: Number(e.target.value) })}
                aria-label="Сколько часов клиент молчит после нашего ответа"
              />
              часов после нашего ответа
            </label>
          ) : trigger === "client.inactive" ? (
            <label className="flex items-center gap-2 text-sm">
              не заходит
              <input type="number" min={1} max={90} className="input h-10 w-24 text-sm" value={Number(conditions.days ?? 5)} onChange={(e) => setConditions({ ...conditions, days: Number(e.target.value) })} />
              дней
            </label>
          ) : trigger === "deal.idle" ? (
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2" title="Активность — смена этапа, сообщение в чатах сделки (и ответ с телефона магазина), задача, звонок, заметка сотрудника">
                ничего не было
                <input
                  type="number"
                  min={1}
                  max={IDLE_LIMITS.days}
                  className="input h-9 w-20 text-sm"
                  value={Number(conditions.days ?? IDLE_DEFAULTS.days)}
                  onChange={(e) => setConditions({ ...conditions, days: Number(e.target.value) })}
                  aria-label="Сколько дней без активности"
                />
                дней
              </label>
              <select className="input h-9 text-sm" value={String(conditions.stageId ?? "")} onChange={(e) => setConditions({ ...conditions, stageId: e.target.value || null })} aria-label="Этап сделки">
                <option value="">на любом открытом этапе</option>
                {ctx.stages.filter((s) => s.open !== false).map((s) => (
                  <option key={s.id} value={s.id}>
                    на этапе «{s.name}»
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2" title="Сколько задач менеджеры успеют за день: остальные сделки правило возьмёт в следующие дни, недавно затихшие — первыми">
                не больше
                <input
                  type="number"
                  min={1}
                  max={IDLE_LIMITS.perDay}
                  className="input h-9 w-20 text-sm"
                  value={Number(conditions.perDay ?? IDLE_DEFAULTS.perDay)}
                  onChange={(e) => setConditions({ ...conditions, perDay: Number(e.target.value) })}
                  aria-label="Сделок в день"
                />
                сделок в день
              </label>
            </div>
          ) : trigger === "occasion.holiday" ? (
            <div className="space-y-2 text-sm">
              <select className="input h-10 text-sm" value={String(conditions.holiday ?? "")} onChange={(e) => setConditions({ ...conditions, holiday: e.target.value || null })} aria-label="Праздник">
                <option value="">любой праздник из списка</option>
                {ctx.holidays.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2">
                за
                <input type="number" min={1} max={120} className="input h-9 w-20 text-sm" value={Number(conditions.daysBefore ?? 30)} onChange={(e) => setConditions({ ...conditions, daysBefore: Number(e.target.value) })} aria-label="За сколько дней до праздника" />
                дней до праздника
              </label>
              <label className="flex items-center gap-2" title="Покупка — оплата или выигранная сделка в эти дни до праздника год назад">
                покупали за
                <input type="number" min={1} max={90} className="input h-9 w-20 text-sm" value={Number(conditions.windowDays ?? 30)} onChange={(e) => setConditions({ ...conditions, windowDays: Number(e.target.value) })} aria-label="За сколько дней до праздника покупали в прошлом году" />
                дней до него год назад
              </label>
              <label className="flex items-center gap-2" title="Сколько задач менеджеры успеют за день: остальных правило возьмёт в следующие дни">
                не больше
                <input type="number" min={1} max={200} className="input h-9 w-20 text-sm" value={Number(conditions.perDay ?? 30)} onChange={(e) => setConditions({ ...conditions, perDay: Number(e.target.value) })} aria-label="Клиентов в день" />
                клиентов в день
              </label>
            </div>
          ) : trigger === "deal.event_date_near" ? (
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                за
                <input
                  type="number"
                  min={1}
                  max={EVENT_DATE_LIMITS.daysBefore}
                  className="input h-9 w-20 text-sm"
                  value={Number(conditions.daysBefore ?? EVENT_DATE_DEFAULTS.daysBefore)}
                  onChange={(e) => setConditions({ ...conditions, daysBefore: Number(e.target.value) })}
                  aria-label="За сколько дней до даты события"
                />
                дней до даты события или меньше
              </label>
              <label className="flex items-center gap-2" title="Как полоска в карточке сделки: ответы из вопросов, у своей книги — слова. Нет книги — 0%, заказ уже в печати — книга готова">
                <input type="checkbox" className="size-4 accent-wine" checked={bookCheck} onChange={(e) => setConditions({ ...conditions, bookBelow: e.target.checked ? 50 : null })} aria-label="Проверять заполненность книги" />
                книга заполнена меньше
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={!bookCheck}
                  className="input h-9 w-20 text-sm"
                  value={bookCheck ? String(conditions.bookBelow) : "50"}
                  onChange={(e) => setConditions({ ...conditions, bookBelow: e.target.value })}
                  aria-label="Порог заполненности книги, %"
                />
                %
              </label>
              <label className="flex items-center gap-2" title="Ни оплаченного заказа сделки, ни принятых по ней денег (предоплата — уже оплата)">
                <input type="checkbox" className="size-4 accent-wine" checked={!!conditions.unpaid} onChange={(e) => setConditions({ ...conditions, unpaid: e.target.checked ? 1 : null })} aria-label="По сделке ничего не оплачено" />
                по сделке ничего не оплачено
              </label>
            </div>
          ) : trigger === "occasion.anniversary" ? (
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                за
                <input
                  type="number"
                  min={1}
                  max={ANNIVERSARY_LIMITS.daysBefore}
                  className="input h-9 w-20 text-sm"
                  value={Number(conditions.daysBefore ?? ANNIVERSARY_DEFAULTS.daysBefore)}
                  onChange={(e) => setConditions({ ...conditions, daysBefore: Number(e.target.value) })}
                  aria-label="За сколько дней до годовщины"
                />
                дней до даты
              </label>
              <label className="flex items-center gap-2" title="Оплата или выигранная сделка с этого дня — клиент уже купил к годовщине; покупка к той же дате — когда бы ни была. Покупка к другому поводу раньше годовщину не гасит">
                кроме купивших снова за
                <input
                  type="number"
                  min={1}
                  max={ANNIVERSARY_LIMITS.windowDays}
                  className="input h-9 w-20 text-sm"
                  value={Number(conditions.windowDays ?? ANNIVERSARY_DEFAULTS.windowDays)}
                  onChange={(e) => setConditions({ ...conditions, windowDays: Number(e.target.value) })}
                  aria-label="За сколько дней до начала окна покупка — уже покупка к годовщине"
                />
                дней до этого и позже
              </label>
            </div>
          ) : (
            <p className="py-2 text-sm text-muted">без условий</p>
          )}
          <select className="input mt-2 h-9 text-sm" value={String(conditions.hours ?? "any")} onChange={(e) => setConditions({ ...conditions, hours: e.target.value === "any" ? null : e.target.value })} aria-label="Время работы правила">
            {Object.entries(automationHours).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-xs font-semibold text-muted uppercase">Что сделать</span>
        {actions.map((a, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line bg-[#fbf9f5] p-3">
            <div className="flex items-center gap-2">
              <select className="input h-9 flex-1 text-sm" value={a.type} onChange={(e) => setActions((l) => l.map((x, j) => (j === i ? blank(e.target.value as AutomationActionType) : x)))} aria-label="Действие">
                {Object.entries(automationActions)
                  // Правило для менеджеров (забытая сделка, клиент молчит) клиенту не пишет: задача, уведомление или готовый текст.
                  .filter(([k]) => k !== "send_message" || !isStaffOnlyTrigger(trigger) || a.type === k)
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
              {actions.length > 1 ? (
                <button className="text-muted hover:text-red-700" onClick={() => setActions((l) => l.filter((_, j) => j !== i))} aria-label="Убрать действие">
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
            {a.type === "create_task" ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_160px_180px]">
                <input className="input h-9 text-sm" placeholder="Текст задачи, например «Перезвонить {имя}»" value={a.title ?? ""} onChange={(e) => setAction(i, { title: e.target.value })} />
                <label className="flex items-center gap-1.5 text-xs text-muted" title="Минуты рабочего времени: ночь и выходные не в счёт — пропущенный ночью звонок получит срок от начала смены. От 1440 (суток) — календарный срок, а если он выпал на ночь — начало смены. По сделке — одна открытая такая задача.">
                  срок
                  <input type="number" min={0} className="input h-9 w-16 text-sm" value={a.dueMinutes ?? 60} onChange={(e) => setAction(i, { dueMinutes: Number(e.target.value) })} />
                  раб. мин
                </label>
                {staffSelect(a.userId, (v) => setAction(i, { userId: v }), "ответственному по сделке")}
              </div>
            ) : a.type === "create_deal" ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
                <input className="input h-9 text-sm" placeholder="Название, например «Годовщина: {повод} — вторая книга»" value={a.title ?? ""} onChange={(e) => setAction(i, { title: e.target.value })} />
                {staffSelect(a.userId, (v) => setAction(i, { userId: v }), "ответственный клиента")}
              </div>
            ) : a.type === "send_message" ? (
              <>
                <textarea className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" rows={3} placeholder="Здравствуйте, {имя}! Получили ваше сообщение…" value={a.text ?? ""} onChange={(e) => setAction(i, { text: e.target.value })} aria-label="Текст на русском" />
                <textarea className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" rows={2} placeholder="Қазақша мәтін — клиенту с казахским языком (необязательно)" value={a.textKk ?? ""} onChange={(e) => setAction(i, { textKk: e.target.value })} aria-label="Текст на казахском" />
                <p className="text-xs text-muted">
                  {isStaffOnlyTrigger(trigger)
                    ? "Это правило — для менеджеров, клиенту оно не пишет: замените действие на задачу или «Подготовить текст клиенту». "
                    : ""}
                  {isTransactionalTrigger(trigger)
                    ? "О заказе — в переписку клиента в WhatsApp, и когда её ведёт бот (бот не останавливается); переписки нет — не уйдёт: первым на новый номер CRM не пишет, в сделке будет заметка."
                    : trigger === "deal.event_date_near"
                      ? "Уйдёт в последний чат сделки, только если диалог не ведёт бот (у него своё напоминание о сроке «впритык»), в окне и в пределах суточного лимита. Надёжнее — задача менеджеру."
                      : "Уйдёт в тот же чат, откуда пришло обращение."}{" "}
                  Клиенту с казахским языком — казахский текст ({"{повод}"} и {"{дата}"} в нём по-казахски), если он заполнен. Переменные: {ruleTemplateVars.join(", ")}
                </p>
              </>
            ) : a.type === "draft_message" ? (
              <>
                <textarea className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" rows={3} placeholder="Здравствуйте, {имя}! Скоро {повод} — {дата}…" value={a.text ?? ""} onChange={(e) => setAction(i, { text: e.target.value })} aria-label="Текст клиенту на русском" />
                <textarea className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" rows={2} placeholder="Қазақша мәтін — клиенту с казахским языком" value={a.textKk ?? ""} onChange={(e) => setAction(i, { textKk: e.target.value })} aria-label="Текст клиенту на казахском" />
                <p className="text-xs text-muted">Клиенту не уходит: текст на языке клиента появится в истории сделки с кнопкой «Открыть в WhatsApp», отправит менеджер. Нужна сделка — поставьте выше «Создать сделку». Переменные: {ruleTemplateVars.join(", ")}</p>
              </>
            ) : a.type === "assign" ? (
              staffSelect(a.userId, (v) => setAction(i, { userId: v }), "по кругу между менеджерами")
            ) : a.type === "move_stage" ? (
              <select className="input h-9 text-sm" value={a.stageId ?? ""} onChange={(e) => setAction(i, { stageId: e.target.value })}>
                <option value="">— выберите этап —</option>
                {ctx.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_180px]">
                <input className="input h-9 text-sm" placeholder="Заголовок" value={a.title ?? ""} onChange={(e) => setAction(i, { title: e.target.value })} />
                <input className="input h-9 text-sm" placeholder="Текст" value={a.text ?? ""} onChange={(e) => setAction(i, { text: e.target.value })} />
                {staffSelect(a.userId, (v) => setAction(i, { userId: v }), "ответственному")}
              </div>
            )}
          </div>
        ))}
        {actions.length < 6 ? (
          <button className="flex items-center gap-1.5 text-sm text-wine hover:underline" onClick={() => setActions((l) => [...l, blank("notify")])}>
            <Plus className="size-4" /> Ещё действие
          </button>
        ) : null}
      </div>
      <div className="flex gap-2">
        <button className="btn btn-sm" disabled={pending} onClick={save}>
          Сохранить правило
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}
