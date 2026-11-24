"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, Plus, Trash2, Zap } from "lucide-react";
import { SidePanel } from "@/components/admin/SidePanel";
import { confirmDialog, toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { BOARD_COLORS, boardColorNames, priorityLabels, ruleActionLabels, ruleTriggerLabels, type BoardColor, type BoardRuleAction, type BoardRuleTrigger, type TaskPriority } from "@/shared/domain/boards";
import { boardsApi, type BoardView, type Staff } from "./client";
import { LabelChip } from "./ui";

type Tab = "general" | "columns" | "labels" | "members" | "rules";

/** Настройки доски: общее, колонки, метки, участники и автоматизация («когда… — тогда…»). Без прав — только просмотр. */
export function BoardSettings({ data, staff, me, onClose, onChanged, onArchived }: { data: BoardView; staff: Staff[]; me: string; onClose: () => void; onChanged: () => void; onArchived: () => void }) {
  const [tab, setTab] = useState<Tab>("rules");
  const b = data.board;
  const can = b.canManage;
  const names = new Map(staff.map((s) => [s.id, s.label]));
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };
  const tabs: [Tab, string][] = [
    ["rules", "Автоматизация"],
    ["columns", "Колонки"],
    ["labels", "Метки"],
    ["members", "Участники"],
    ["general", "Доска"],
  ];
  return (
    <SidePanel open onClose={onClose} title={can ? "Настройки доски" : "О доске"} description={b.name}>
      <nav className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto" aria-label="Разделы настроек">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" className="chip shrink-0" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </nav>

      {tab === "general" ? <General data={data} can={can} run={run} onArchived={onArchived} /> : null}

      {tab === "columns" ? (
        <div className="flex flex-col gap-2">
          {data.columns.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-[var(--r-ctl)] border border-line p-2">
              <input defaultValue={c.name} key={c.name} readOnly={!can} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && run(() => boardsApi.updateColumn(c.id, { name: e.target.value }))} className="input h-8 min-w-0 flex-1 text-[13px]" aria-label="Название колонки" />
              <input type="number" min={0} max={999} defaultValue={c.wipLimit ?? ""} key={`w${c.wipLimit}`} readOnly={!can} placeholder="WIP" title="Лимит карточек в работе" onBlur={(e) => String(c.wipLimit ?? "") !== e.target.value && run(() => boardsApi.updateColumn(c.id, { wipLimit: e.target.value ? Number(e.target.value) : null }))} className="input h-8 w-16 text-[13px]" aria-label={`Лимит «${c.name}»`} />
              <label className="flex items-center gap-1 text-xs text-muted" title="Карточка в этой колонке — выполнена">
                <input type="checkbox" disabled={!can} checked={c.done} onChange={(e) => run(() => boardsApi.updateColumn(c.id, { done: e.target.checked }))} className="size-4 accent-[var(--color-success)]" />
                готово
              </label>
              {can ? (
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Удалить колонку «${c.name}»`} onClick={async () => (await confirmDialog({ title: `Удалить колонку «${c.name}»?`, text: "Карточки перейдут в соседнюю колонку.", confirmLabel: "Удалить", danger: true })) && run(() => boardsApi.deleteColumn(c.id))}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
          {can ? <AddRow placeholder="Новая колонка" onAdd={(name) => run(() => boardsApi.addColumn(b.id, { name, afterId: data.columns.filter((c) => !c.done).at(-1)?.id ?? null }))} /> : null}
          <p className="text-xs text-muted">Порядок колонок меняется перетаскиванием на доске. «Готово» — карточка в колонке выполнена, выполненная попадает в неё сама.</p>
        </div>
      ) : null}

      {tab === "labels" ? (
        <div className="flex flex-col gap-2">
          {data.labels.map((l) => (
            <div key={l.id} className="flex items-center gap-2">
              <LabelChip name={l.name} color={l.color} className="w-28" />
              {can ? (
                <>
                  <input defaultValue={l.name} key={l.name} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && run(() => boardsApi.updateLabel(b.id, l.id, { name: e.target.value }))} className="input h-8 min-w-0 flex-1 text-[13px]" aria-label="Название метки" />
                  <ColorSelect value={l.color} onChange={(color) => run(() => boardsApi.updateLabel(b.id, l.id, { color }))} />
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label={`Удалить метку «${l.name}»`} onClick={async () => (await confirmDialog({ title: `Удалить метку «${l.name}»?`, text: "Она снимется со всех карточек.", confirmLabel: "Удалить", danger: true })) && run(() => boardsApi.deleteLabel(b.id, l.id))}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </>
              ) : null}
            </div>
          ))}
          <AddRow placeholder="Новая метка" onAdd={(name) => run(() => boardsApi.addLabel(b.id, { name, color: (Object.keys(BOARD_COLORS) as BoardColor[])[data.labels.length % 8] }))} />
        </div>
      ) : null}

      {tab === "members" ? (
        <div className="flex flex-col gap-2 text-[13px]">
          <p className="text-xs text-muted">{b.visibility === "all" ? "Доску видят все сотрудники. Участники-админы меняют колонки, метки и автоматизацию." : "Доску видят только участники. Админы доски меняют её настройки."}</p>
          {data.members.map((m) => (
            <div key={m.userId} className="flex items-center gap-2">
              <span className="flex-1 truncate">
                {names.get(m.userId) ?? "Сотрудник"}
                {m.userId === b.ownerId ? <span className="text-muted"> · владелец</span> : null}
                {m.userId === me ? <span className="text-muted"> · вы</span> : null}
              </span>
              <select disabled={!can || m.userId === b.ownerId} value={m.role} onChange={(e) => run(() => boardsApi.setMember(b.id, m.userId, e.target.value as "admin" | "member"))} className="input h-8 w-auto text-[13px]" aria-label="Роль на доске">
                <option value="member">Участник</option>
                <option value="admin">Админ доски</option>
              </select>
              {can && m.userId !== b.ownerId ? (
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Убрать с доски" onClick={() => run(() => boardsApi.setMember(b.id, m.userId, null))}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
          {can ? (
            <select className="input h-8 text-[13px]" value="" onChange={(e) => e.target.value && run(() => boardsApi.setMember(b.id, e.target.value, "member"), "Добавлен на доску")} aria-label="Добавить участника">
              <option value="">Добавить участника…</option>
              {staff
                .filter((s) => !data.members.some((m) => m.userId === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {tab === "rules" ? <Rules data={data} staff={staff} can={can} run={run} /> : null}
    </SidePanel>
  );
}

function General({ data, can, run, onArchived }: { data: BoardView; can: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; onArchived: () => void }) {
  const router = useRouter();
  const b = data.board;
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <label className="flex flex-col gap-1">
        <span className="label">Название</span>
        <input defaultValue={b.name} readOnly={!can} onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && run(() => boardsApi.updateBoard(b.id, { name: e.target.value }), "Сохранено")} className="input" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Описание</span>
        <textarea defaultValue={b.description ?? ""} readOnly={!can} rows={2} onBlur={(e) => e.target.value !== (b.description ?? "") && run(() => boardsApi.updateBoard(b.id, { description: e.target.value }), "Сохранено")} className="input min-h-16 py-2" />
      </label>
      <div className="flex flex-col gap-1">
        <span className="label">Цвет</span>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BOARD_COLORS) as BoardColor[]).map((k) => (
            <button key={k} type="button" disabled={!can} onClick={() => run(() => boardsApi.updateBoard(b.id, { color: k }))} className={cn("size-7 rounded-[6px] ring-offset-2", b.color === k && "ring-2 ring-ink")} style={{ background: BOARD_COLORS[k] }} aria-label={boardColorNames[k]} title={boardColorNames[k]} />
          ))}
        </div>
      </div>
      {b.kind !== "personal" && !b.isDefault ? (
        <label className="flex flex-col gap-1">
          <span className="label">Кто видит</span>
          <select disabled={!can} value={b.visibility} onChange={(e) => run(() => boardsApi.updateBoard(b.id, { visibility: e.target.value as "all" | "members" }), "Сохранено")} className="input">
            <option value="all">Все сотрудники</option>
            <option value="members">Только участники</option>
          </select>
        </label>
      ) : null}
      {b.isDefault ? <p className="text-xs text-muted">Доска по умолчанию: сюда попадают задачи из сделок, правил CRM и бота. Её нельзя убрать в архив или скрыть.</p> : null}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() =>
            run(async () => {
              const { id } = await boardsApi.create({ name: `${b.name} (копия)`, from: b.id });
              router.push(`/admin/tasks/boards/${id}`);
            })
          }
        >
          <Copy className="size-4" aria-hidden /> Доска по образцу этой
        </button>
        {can && !b.isDefault ? (
          <button type="button" className="btn btn-outline btn-sm text-danger" onClick={async () => (await confirmDialog({ title: `Убрать доску «${b.name}» в архив?`, text: "Карточки останутся в «Задачах» и «Моём дне»; доску можно вернуть из архива на странице досок.", confirmLabel: "В архив" })) && run(() => boardsApi.updateBoard(b.id, { archived: true })).then(onArchived)}>
            <Archive className="size-4" aria-hidden /> В архив
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v.trim());
        setV("");
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} maxLength={60} className="input h-8 flex-1 text-[13px]" aria-label={placeholder} />
      <button className="btn btn-dark btn-sm" disabled={!v.trim()}>
        <Plus className="size-4" aria-hidden /> Добавить
      </button>
    </form>
  );
}

function ColorSelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input h-8 w-28 text-[13px]" aria-label="Цвет">
      {(Object.keys(BOARD_COLORS) as BoardColor[]).map((k) => (
        <option key={k} value={k}>
          {boardColorNames[k]}
        </option>
      ))}
    </select>
  );
}

// ─── Автоматизация ───

function describeTrigger(t: BoardRuleTrigger, cols: Map<string, string>) {
  if (t.type === "card.moved") return `Карточку перенесли в «${cols.get(t.columnId) ?? "?"}»`;
  if (t.type === "card.added") return t.columnId ? `Карточка появилась в «${cols.get(t.columnId) ?? "?"}»` : ruleTriggerLabels[t.type];
  return ruleTriggerLabels[t.type];
}

function describeAction(a: BoardRuleAction, ctx: { cols: Map<string, string>; labels: Map<string, string>; names: Map<string, string> }) {
  switch (a.type) {
    case "assign":
      return a.userId === "mover" ? "назначить того, кто перенёс" : `назначить ${ctx.names.get(a.userId) ?? "сотрудника"}`;
    case "watch":
      return `наблюдатель — ${ctx.names.get(a.userId) ?? "сотрудник"}`;
    case "set_due":
      return a.days || a.hours ? `срок через ${[a.days ? `${a.days} дн.` : "", a.hours ? `${a.hours} ч` : ""].filter(Boolean).join(" ")}` : "убрать срок";
    case "notify":
      return a.to === "user" ? `уведомить ${ctx.names.get(a.userId ?? "") ?? "сотрудника"}` : a.to === "watchers" ? "уведомить наблюдателей" : "уведомить исполнителей";
    case "add_label":
      return `метка «${ctx.labels.get(a.labelId) ?? "?"}»`;
    case "remove_label":
      return `снять метку «${ctx.labels.get(a.labelId) ?? "?"}»`;
    case "move":
      return `в колонку «${ctx.cols.get(a.columnId) ?? "?"}»`;
    case "set_priority":
      return a.priority ? `приоритет «${priorityLabels[a.priority]}»` : "убрать приоритет";
    case "add_checklist":
      return `чек-лист «${a.title}» (${a.items.length})`;
    default:
      return ruleActionLabels[a.type].toLowerCase();
  }
}

function Rules({ data, staff, can, run }: { data: BoardView; staff: Staff[]; can: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const ctx = { cols: new Map(data.columns.map((c) => [c.id, c.name])), labels: new Map(data.labels.map((l) => [l.id, l.name])), names: new Map(staff.map((s) => [s.id, s.label])) };
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <p className="text-xs text-muted">Правила срабатывают сами: при переносе, появлении и выполнении карточки и когда прошёл срок. Уведомления — по одному на карточку, пока не прочитано.</p>
      {data.rules.map((r) => (
        <article key={r.id} className={cn("rounded-[var(--r-ctl)] border border-line p-3", !r.enabled && "opacity-60")}>
          <div className="flex items-start gap-2">
            <Zap className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.name}</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                <b>Когда:</b> {describeTrigger(r.trigger, ctx.cols)}
                <br />
                <b>Тогда:</b> {r.actions.map((a) => describeAction(a, ctx)).join(", ")}
              </p>
              <p className="mt-1 text-[11px] text-muted">{r.runs ? `Сработало ${r.runs} раз, последний — ${new Date(r.lastRunAt!).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Ещё не срабатывало"}</p>
            </div>
            {can ? (
              <div className="flex shrink-0 items-center gap-1">
                <label className="switch" title={r.enabled ? "Выключить" : "Включить"}>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => run(() => boardsApi.updateRule(r.id, { enabled: e.target.checked }))} className="size-4 accent-[var(--color-wine)]" aria-label={r.enabled ? "Выключить правило" : "Включить правило"} />
                </label>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Удалить правило" onClick={async () => (await confirmDialog({ title: `Удалить правило «${r.name}»?`, confirmLabel: "Удалить", danger: true })) && run(() => boardsApi.deleteRule(r.id))}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        </article>
      ))}
      {!data.rules.length ? <p className="text-muted">Правил пока нет.</p> : null}
      {can ? adding ? <RuleBuilder data={data} staff={staff} ctx={ctx} onCancel={() => setAdding(false)} onSave={(rule) => run(() => boardsApi.addRule(data.board.id, rule), "Правило добавлено").then(() => setAdding(false))} /> : (
        <button type="button" className="btn btn-dark btn-sm self-start" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Новое правило
        </button>
      ) : null}
    </div>
  );
}

const ACTION_TYPES: BoardRuleAction["type"][] = ["assign", "set_due", "notify", "add_label", "remove_label", "move", "add_checklist", "set_priority", "watch", "mark_done", "unassign"];

function defaultAction(type: BoardRuleAction["type"], data: BoardView, staff: Staff[]): BoardRuleAction {
  switch (type) {
    case "assign":
      return { type, userId: "mover" };
    case "watch":
      return { type, userId: staff[0]?.id ?? "" };
    case "set_due":
      return { type, days: 1, hours: 0 };
    case "notify":
      return { type, to: "assignees", userId: null, text: null };
    case "add_label":
    case "remove_label":
      return { type, labelId: data.labels[0]?.id ?? "" };
    case "move":
      return { type, columnId: data.columns[0]?.id ?? "" };
    case "set_priority":
      return { type, priority: "high" };
    case "add_checklist":
      return { type, title: "Чек-лист", items: [] };
    default:
      return { type } as BoardRuleAction;
  }
}

function RuleBuilder({ data, staff, ctx, onCancel, onSave }: { data: BoardView; staff: Staff[]; ctx: Parameters<typeof describeAction>[1]; onCancel: () => void; onSave: (r: { name: string; trigger: BoardRuleTrigger; actions: BoardRuleAction[] }) => void }) {
  const [trigger, setTrigger] = useState<BoardRuleTrigger>({ type: "card.moved", columnId: data.columns[1]?.id ?? data.columns[0]?.id ?? "" });
  const [actions, setActions] = useState<BoardRuleAction[]>([{ type: "assign", userId: "mover" }]);
  const [name, setName] = useState("");
  const auto = `${describeTrigger(trigger, ctx.cols)} — ${actions.map((a) => describeAction(a, ctx)).join(", ")}`.slice(0, 120);
  const set = (i: number, a: BoardRuleAction) => setActions((xs) => xs.map((x, j) => (j === i ? a : x)));
  return (
    <form
      className="flex flex-col gap-3 rounded-[var(--r-ctl)] border border-line-strong bg-sunken/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name: name.trim() || auto, trigger, actions });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Когда</span>
        <select value={trigger.type} onChange={(e) => setTrigger(e.target.value === "card.moved" ? { type: "card.moved", columnId: data.columns[0]?.id ?? "" } : e.target.value === "card.added" ? { type: "card.added", columnId: null } : ({ type: e.target.value } as BoardRuleTrigger))} className="input h-8 text-[13px]">
          {(Object.keys(ruleTriggerLabels) as BoardRuleTrigger["type"][]).map((t) => (
            <option key={t} value={t}>
              {ruleTriggerLabels[t]}
            </option>
          ))}
        </select>
      </label>
      {trigger.type === "card.moved" || trigger.type === "card.added" ? (
        <select value={trigger.columnId ?? ""} onChange={(e) => setTrigger(trigger.type === "card.moved" ? { type: "card.moved", columnId: e.target.value } : { type: "card.added", columnId: e.target.value || null })} className="input h-8 text-[13px]" aria-label="Колонка">
          {trigger.type === "card.added" ? <option value="">в любой колонке</option> : null}
          {data.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {trigger.type === "card.moved" ? "в колонку " : "в колонке "}«{c.name}»
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted">Тогда</span>
        {actions.map((a, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-[var(--r-ctl)] border border-line bg-white p-2">
            <div className="flex gap-1.5">
              <select value={a.type} onChange={(e) => set(i, defaultAction(e.target.value as BoardRuleAction["type"], data, staff))} className="input h-8 flex-1 text-[13px]" aria-label="Действие">
                {ACTION_TYPES.map((t) => (
                  <option key={t} value={t} disabled={(t === "add_label" || t === "remove_label") && !data.labels.length}>
                    {ruleActionLabels[t]}
                  </option>
                ))}
              </select>
              {actions.length > 1 ? (
                <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Убрать действие" onClick={() => setActions((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <ActionParams action={a} data={data} staff={staff} onChange={(x) => set(i, x)} />
          </div>
        ))}
        {actions.length < 10 ? (
          <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => setActions((xs) => [...xs, defaultAction("notify", data, staff)])}>
            <Plus className="size-4" aria-hidden /> Ещё действие
          </button>
        ) : null}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted">Название (необязательно)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={auto} maxLength={120} className="input h-8 text-[13px]" />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-dark btn-sm">Сохранить правило</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function ActionParams({ action: a, data, staff, onChange }: { action: BoardRuleAction; data: BoardView; staff: Staff[]; onChange: (a: BoardRuleAction) => void }) {
  const cls = "input h-8 text-[13px]";
  switch (a.type) {
    case "assign":
      return (
        <select value={a.userId} onChange={(e) => onChange({ ...a, userId: e.target.value })} className={cls} aria-label="Кого назначить">
          <option value="mover">Того, кто перенёс карточку</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      );
    case "watch":
      return (
        <select value={a.userId} onChange={(e) => onChange({ ...a, userId: e.target.value })} className={cls} aria-label="Наблюдатель">
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      );
    case "set_due":
      return (
        <div className="flex items-center gap-1.5 text-[13px]">
          через
          <input type="number" min={0} max={365} value={a.days} onChange={(e) => onChange({ ...a, days: Number(e.target.value) || 0 })} className="input h-8 w-16 text-[13px]" aria-label="Дней" />
          дн.
          <input type="number" min={0} max={720} value={a.hours} onChange={(e) => onChange({ ...a, hours: Number(e.target.value) || 0 })} className="input h-8 w-16 text-[13px]" aria-label="Часов" />
          ч
        </div>
      );
    case "notify":
      return (
        <div className="flex flex-col gap-1.5">
          <select value={a.to === "user" ? (a.userId ?? "") : a.to} onChange={(e) => onChange(e.target.value === "assignees" || e.target.value === "watchers" ? { ...a, to: e.target.value, userId: null } : { ...a, to: "user", userId: e.target.value })} className={cls} aria-label="Кого уведомить">
            <option value="assignees">Исполнителей</option>
            <option value="watchers">Наблюдателей</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <input value={a.text ?? ""} onChange={(e) => onChange({ ...a, text: e.target.value })} placeholder="Текст (необязательно)" maxLength={200} className={cls} />
        </div>
      );
    case "add_label":
    case "remove_label":
      return (
        <select value={a.labelId} onChange={(e) => onChange({ ...a, labelId: e.target.value })} className={cls} aria-label="Метка">
          {data.labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      );
    case "move":
      return (
        <select value={a.columnId} onChange={(e) => onChange({ ...a, columnId: e.target.value })} className={cls} aria-label="Колонка">
          {data.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      );
    case "set_priority":
      return (
        <select value={a.priority ?? ""} onChange={(e) => onChange({ ...a, priority: (e.target.value || null) as TaskPriority | null })} className={cls} aria-label="Приоритет">
          <option value="">Без приоритета</option>
          {(Object.keys(priorityLabels) as TaskPriority[]).map((p) => (
            <option key={p} value={p}>
              {priorityLabels[p]}
            </option>
          ))}
        </select>
      );
    case "add_checklist":
      return (
        <div className="flex flex-col gap-1.5">
          <input value={a.title} onChange={(e) => onChange({ ...a, title: e.target.value })} placeholder="Название чек-листа" maxLength={120} className={cls} />
          <textarea value={a.items.join("\n")} onChange={(e) => onChange({ ...a, items: e.target.value.split("\n") })} placeholder="Пункты — по одному в строке" rows={3} className="input min-h-16 py-1.5 text-[13px]" />
        </div>
      );
    default:
      return null;
  }
}
