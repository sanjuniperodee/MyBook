/**
 * Доски задач (модуль boards) — общий словарь без зависимостей: типы колонок, метки, приоритеты, повторы, правила
 * автоматизации досок и шаблоны досок. Годится и серверу, и интерфейсу, и схеме БД.
 */

export const TASK_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const priorityLabels: Record<TaskPriority, string> = { urgent: "Срочно", high: "Высокий", normal: "Обычный", low: "Низкий" };

/**
 * Цвета меток и обложек — только токены темы: светлая и тёмная работают без своих правил (DESIGN.md §3).
 * Значение — CSS-цвет на токенах; плашка метки — тот же цвет с прозрачностью.
 */
export const BOARD_COLORS = {
  wine: "var(--color-wine)",
  danger: "var(--color-danger)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
  info: "var(--color-info)",
  violet: "color-mix(in oklab, var(--color-wine) 50%, var(--color-info))",
  teal: "color-mix(in oklab, var(--color-success) 50%, var(--color-info))",
  slate: "var(--color-muted)",
} as const;
export type BoardColor = keyof typeof BOARD_COLORS;
export const boardColorNames: Record<BoardColor, string> = { wine: "Винный", danger: "Красный", warning: "Жёлтый", success: "Зелёный", info: "Синий", violet: "Фиолетовый", teal: "Бирюзовый", slate: "Серый" };
export const isBoardColor = (v: unknown): v is BoardColor => typeof v === "string" && v in BOARD_COLORS;

/** Повтор задачи: после выполнения — следующая карточка со сдвигом срока. */
export interface TaskRecurrence {
  freq: "daily" | "weekdays" | "weekly" | "monthly";
  /** Каждые N (дней, недель, месяцев); у weekdays не используется. */
  interval: number;
  /** До какой даты (ISO), включительно; null — без конца. */
  until?: string | null;
}

export const recurrenceLabels: Record<TaskRecurrence["freq"], string> = { daily: "Каждый день", weekdays: "По будням", weekly: "Каждую неделю", monthly: "Каждый месяц" };

/** Срок следующей карточки повтора. Будни — следующий понедельник–пятница. */
export function nextOccurrence(due: Date, r: TaskRecurrence): Date | null {
  const n = Math.max(1, Math.min(365, Math.floor(r.interval || 1)));
  const d = new Date(due);
  if (r.freq === "daily") d.setDate(d.getDate() + n);
  else if (r.freq === "weekly") d.setDate(d.getDate() + 7 * n);
  else if (r.freq === "monthly") {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else {
    do d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6);
  }
  if (r.until && d.getTime() > new Date(`${r.until.slice(0, 10)}T23:59:59`).getTime()) return null;
  return d;
}

export function isRecurrence(v: unknown): v is TaskRecurrence {
  if (!v || typeof v !== "object") return false;
  const r = v as TaskRecurrence;
  return ["daily", "weekdays", "weekly", "monthly"].includes(r.freq) && Number.isInteger(r.interval) && r.interval >= 1 && r.interval <= 365 && (r.until == null || /^\d{4}-\d{2}-\d{2}/.test(r.until));
}

// ─── Автоматизация досок («как Butler») ─────────────────────────────────────────────────────────────────────────────

export type BoardRuleTrigger =
  /** Карточка появилась на доске (в колонке или в любой). */
  | { type: "card.added"; columnId?: string | null }
  /** Карточку перенесли в колонку. */
  | { type: "card.moved"; columnId: string }
  /** Срок прошёл (проход планировщика; один раз на срок). */
  | { type: "card.overdue" }
  /** Карточку отметили выполненной. */
  | { type: "card.done" }
  /** Все пункты чек-листов отмечены. */
  | { type: "checklist.completed" };

export type BoardRuleAction =
  /** Назначить: сотрудника или того, кто перенёс карточку (mover). */
  | { type: "assign"; userId: string | "mover" }
  | { type: "unassign" }
  /** Срок: через столько дней и часов от момента срабатывания (0/0 — убрать срок). */
  | { type: "set_due"; days: number; hours: number }
  /** Уведомить исполнителей, наблюдателей или сотрудника (одно уведомление на карточку — по правилам без флуда). */
  | { type: "notify"; to: "assignees" | "watchers" | "user"; userId?: string | null; text?: string | null }
  | { type: "add_label"; labelId: string }
  | { type: "remove_label"; labelId: string }
  | { type: "move"; columnId: string }
  | { type: "mark_done" }
  | { type: "set_priority"; priority: TaskPriority | null }
  | { type: "add_checklist"; title: string; items: string[] }
  | { type: "watch"; userId: string };

export const ruleTriggerLabels: Record<BoardRuleTrigger["type"], string> = {
  "card.added": "Карточка появилась на доске",
  "card.moved": "Карточку перенесли в колонку",
  "card.overdue": "Срок карточки прошёл",
  "card.done": "Карточку выполнили",
  "checklist.completed": "Чек-лист выполнен целиком",
};

export const ruleActionLabels: Record<BoardRuleAction["type"], string> = {
  assign: "Назначить",
  unassign: "Снять исполнителя",
  set_due: "Поставить срок",
  notify: "Уведомить",
  add_label: "Добавить метку",
  remove_label: "Снять метку",
  move: "Перенести в колонку",
  mark_done: "Отметить выполненной",
  set_priority: "Приоритет",
  add_checklist: "Добавить чек-лист",
  watch: "Добавить наблюдателя",
};

// ─── Шаблоны досок ──────────────────────────────────────────────────────────────────────────────────────────────────

export type BoardKind = "team" | "personal" | "project";
export type BoardDepartment = "sales" | "production" | "support" | null;

export interface BoardTemplate {
  key: string;
  name: string;
  description: string;
  kind: BoardKind;
  department: BoardDepartment;
  color: BoardColor;
  columns: { name: string; done?: boolean; wip?: number | null; color?: BoardColor | null }[];
  labels: { name: string; color: BoardColor }[];
  /** Правила: колонки и метки — по индексу в шаблоне. */
  rules: { name: string; trigger: { type: BoardRuleTrigger["type"]; column?: number }; actions: ({ type: "add_label"; label: number } | { type: "remove_label"; label: number } | { type: "set_due"; days: number; hours: number } | { type: "assign"; userId: "mover" } | { type: "notify"; to: "assignees" | "watchers" } | { type: "add_checklist"; title: string; items: string[] })[] }[];
}

const OVERDUE_LABEL = { name: "Просрочено", color: "danger" as const };

/** «Срок прошёл → метка „Просрочено“»: правило по умолчанию у каждой доски из шаблона (метка — первая в списке). */
const overdueRule = { name: "Срок прошёл — метка «Просрочено»", trigger: { type: "card.overdue" as const }, actions: [{ type: "add_label" as const, label: 0 }] };

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    key: "sales",
    name: "Продажи",
    description: "Звонки, сообщения и встречи по сделкам. Сюда попадают задачи из сделок, правил и бота.",
    kind: "team",
    department: "sales",
    color: "wine",
    columns: [{ name: "К выполнению" }, { name: "В работе", wip: null }, { name: "Ждём клиента" }, { name: "Готово", done: true }],
    labels: [OVERDUE_LABEL, { name: "Горячий", color: "wine" }, { name: "Повторная продажа", color: "success" }, { name: "Подарок к дате", color: "warning" }],
    rules: [overdueRule],
  },
  {
    key: "production",
    name: "Производство книги",
    description: "Макет → согласование → печать → доставка: каждая книга — карточка с чек-листом.",
    kind: "team",
    department: "production",
    color: "info",
    columns: [{ name: "Новые" }, { name: "Макет", wip: 8 }, { name: "Согласование с клиентом" }, { name: "Печать", wip: 10 }, { name: "Доставка" }, { name: "Готово", done: true }],
    labels: [OVERDUE_LABEL, { name: "Срочно к дате", color: "wine" }, { name: "Экспресс", color: "warning" }, { name: "Правки", color: "violet" }, { name: "Подарок", color: "success" }],
    rules: [
      overdueRule,
      {
        name: "Попала в «Макет» — чек-лист вёрстки",
        trigger: { type: "card.moved", column: 1 },
        actions: [{ type: "add_checklist", title: "Макет", items: ["Проверить тексты и опечатки", "Проверить фото и места фото", "Обложка и оборот", "Собрать печатные файлы"] }],
      },
      { name: "Попала в «Печать» — срок 7 дней, уведомить", trigger: { type: "card.moved", column: 3 }, actions: [{ type: "set_due", days: 7, hours: 0 }, { type: "notify", to: "assignees" }] },
    ],
  },
  {
    key: "support",
    name: "Поддержка",
    description: "Обращения и просьбы клиентов: от нового до решённого.",
    kind: "team",
    department: "support",
    color: "teal",
    columns: [{ name: "Новые" }, { name: "В работе", wip: 6 }, { name: "Ждём ответа клиента" }, { name: "Решено", done: true }],
    labels: [OVERDUE_LABEL, { name: "Ошибка сайта", color: "danger" }, { name: "Вопрос", color: "info" }, { name: "Возврат", color: "warning" }],
    rules: [overdueRule, { name: "Взяли в работу — назначить того, кто перенёс", trigger: { type: "card.moved", column: 1 }, actions: [{ type: "assign", userId: "mover" }] }],
  },
  {
    key: "personal",
    name: "Личная доска",
    description: "Свои дела: видите только вы и те, кого пригласите.",
    kind: "personal",
    department: null,
    color: "slate",
    columns: [{ name: "Сделать" }, { name: "Сегодня" }, { name: "В работе" }, { name: "Готово", done: true }],
    labels: [OVERDUE_LABEL, { name: "Важно", color: "wine" }],
    rules: [overdueRule],
  },
  {
    key: "project",
    name: "Проект",
    description: "Запуск, кампания, улучшение: идеи → план → в работе → проверка → готово.",
    kind: "project",
    department: null,
    color: "violet",
    columns: [{ name: "Идеи" }, { name: "План" }, { name: "В работе", wip: 5 }, { name: "Проверка" }, { name: "Готово", done: true }],
    labels: [OVERDUE_LABEL, { name: "Блокер", color: "danger" }, { name: "Маркетинг", color: "wine" }, { name: "Сайт", color: "info" }, { name: "Производство", color: "teal" }],
    rules: [overdueRule],
  },
];

export const boardTemplate = (key: string) => BOARD_TEMPLATES.find((t) => t.key === key) ?? null;

/** Позиция между соседями (дробная): перенос карточки — одна запись, без пересчёта всей колонки. */
export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return 1024;
  if (before == null) return (after as number) - 1024;
  if (after == null) return before + 1024;
  return (before + after) / 2;
}

/** Позиции колонки слишком сблизились (дробление после многих переносов) — пора переложить шагом 1024. */
export const positionsCrowded = (a: number, b: number) => Math.abs(a - b) < 1e-6;
