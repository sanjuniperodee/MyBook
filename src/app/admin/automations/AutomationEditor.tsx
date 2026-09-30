"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Plus, Trash2, X, Zap } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { automationActions, automationHours, automationTriggers, templateVars, type AutomationActionType } from "@/lib/crm/automation-meta";
import { dealSourceLabels, dealSources } from "@/lib/crm/deal-meta";
import type { AutomationAction } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
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
  stages: { id: string; name: string }[];
  staff: { id: string; label: string }[];
}

const blank = (type: AutomationActionType): AutomationAction =>
  type === "create_task" ? { type, title: "", dueMinutes: 60, userId: null } : type === "create_deal" ? { type, title: "", userId: null } : type === "send_message" ? { type, text: "" } : type === "notify" ? { type, title: "", text: "", userId: null } : type === "move_stage" ? { type, stageId: "" } : { type, userId: null };

function describe(r: Rule, ctx: Ctx) {
  const t = automationTriggers[r.trigger as keyof typeof automationTriggers]?.label ?? r.trigger;
  const cond =
    (r.conditions.stageId ? ` «${ctx.stages.find((s) => s.id === r.conditions.stageId)?.name ?? "?"}»` : "") +
    (r.conditions.minutes ? ` ${r.conditions.minutes} мин` : "") +
    (r.conditions.days ? ` ${r.conditions.days} дн.` : "") +
    (r.conditions.daysBefore ? ` за ${r.conditions.daysBefore} дн.` : "") +
    (r.conditions.source ? ` (${dealSourceLabels[r.conditions.source as keyof typeof dealSourceLabels] ?? r.conditions.source})` : "") +
    (r.conditions.hours ? ` · ${automationHours[r.conditions.hours as keyof typeof automationHours]}` : "");
  return { trigger: t + cond, actions: r.actions.map((a) => automationActions[a.type]).join(", ") };
}

export function AutomationCard({ rule, stats, ctx }: { rule: Rule | null; stats: { runs: number; last: string | null } | null; ctx: Ctx }) {
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
          ) : trigger === "message.unanswered" ? (
            <label className="flex items-center gap-2 text-sm">
              дольше
              <input type="number" min={1} max={1440} className="input h-10 w-24 text-sm" value={Number(conditions.minutes ?? 15)} onChange={(e) => setConditions({ ...conditions, minutes: Number(e.target.value) })} />
              рабочих минут
            </label>
          ) : trigger === "client.inactive" ? (
            <label className="flex items-center gap-2 text-sm">
              не заходит
              <input type="number" min={1} max={90} className="input h-10 w-24 text-sm" value={Number(conditions.days ?? 5)} onChange={(e) => setConditions({ ...conditions, days: Number(e.target.value) })} />
              дней
            </label>
          ) : trigger === "occasion.anniversary" ? (
            <label className="flex items-center gap-2 text-sm">
              за
              <input type="number" min={1} max={120} className="input h-10 w-24 text-sm" value={Number(conditions.daysBefore ?? 30)} onChange={(e) => setConditions({ ...conditions, daysBefore: Number(e.target.value) })} />
              дней до даты
            </label>
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
                {Object.entries(automationActions).map(([k, v]) => (
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
              <div className="grid gap-2 sm:grid-cols-[1fr_130px_180px]">
                <input className="input h-9 text-sm" placeholder="Текст задачи, например «Перезвонить {имя}»" value={a.title ?? ""} onChange={(e) => setAction(i, { title: e.target.value })} />
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  срок
                  <input type="number" min={0} className="input h-9 w-16 text-sm" value={a.dueMinutes ?? 60} onChange={(e) => setAction(i, { dueMinutes: Number(e.target.value) })} />
                  мин
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
                <textarea className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm" rows={3} placeholder="Здравствуйте, {имя}! Получили ваше сообщение…" value={a.text ?? ""} onChange={(e) => setAction(i, { text: e.target.value })} />
                <p className="text-xs text-muted">Уйдёт в тот же чат, откуда пришло обращение. Переменные: {templateVars.join(", ")}</p>
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
