import { contextError } from "@/shared/domain/DomainError";
import type { BoardRuleAction, BoardRuleTrigger } from "@/shared/domain/boards";

export * from "./ical";
export * from "./activity";

export type BoardsErrorCode = "forbidden" | "notFound" | "invalid" | "tooLarge" | "googleNotConfigured" | "googleFailed";

/** Ошибка досок: code — для статуса ответа, message — текст сотруднику (CRM по-русски). */
export const BoardsError = contextError<BoardsErrorCode>("boards", "BoardsError");
export type BoardsError = InstanceType<typeof BoardsError>;

/** HTTP-статус ошибки досок. */
export const boardsErrorStatus = (code: string) => (code === "notFound" ? 404 : code === "forbidden" ? 403 : code === "googleFailed" ? 502 : 400);

/** Кто работает с досками: права роли CRM, сведённые к тому, что нужно доскам. */
export interface BoardViewer {
  userId: string;
  name: string;
  /** Роль видит все записи (scope «все»). */
  seesAll: boolean;
  /** Право tasks.all: видеть и закрывать задачи всех. */
  allTasks: boolean;
  /** Право boards.manage: общие доски, их колонки, участники и правила. */
  manageBoards: boolean;
}

export interface BoardAccessInfo {
  ownerId: string | null;
  visibility: "all" | "members";
  /** Роль зрителя в участниках доски; null — не участник. */
  memberRole: "admin" | "member" | null;
}

/** Видит доску: общая — все сотрудники; закрытая — владелец, участники и те, кто управляет досками. */
export const canSeeBoard = (v: BoardViewer, b: BoardAccessInfo) => b.visibility === "all" || v.manageBoards || b.ownerId === v.userId || b.memberRole !== null;

/** Меняет доску (колонки, метки, участники, правила): право boards.manage, владелец или админ доски. */
export const canManageBoard = (v: BoardViewer, b: BoardAccessInfo) => v.manageBoards || b.ownerId === v.userId || b.memberRole === "admin";

export interface CardAccessInfo {
  assigneeId: string | null;
  createdById: string | null;
  /** Привязка к клиенту (сделка, заказ, клиент, чат): такие карточки «только своим» видны как раньше — свои и ничьи. */
  clientLinked: boolean;
  /** Соисполнители и наблюдатели. */
  memberIds: string[];
}

/**
 * Видит карточку на доске, которую видит. Карточка без клиента (внутренняя) — все, кто видит доску. Карточка о клиенте —
 * роли «все записи» и tasks.all; остальным, как в «Задачах», — свои (исполнитель, соисполнитель, наблюдатель, автор) и ничьи.
 */
export function canSeeCard(v: BoardViewer, c: CardAccessInfo) {
  if (!c.clientLinked || v.seesAll || v.allTasks) return true;
  return !c.assigneeId || c.assigneeId === v.userId || c.createdById === v.userId || c.memberIds.includes(v.userId);
}

/**
 * Меняет карточку: внутреннюю — любой, кто её видит; о клиенте — как задачу (canManageTask): tasks.all, ничья, своя,
 * поставленная им, — плюс соисполнитель и админ доски.
 */
export function canEditCard(v: BoardViewer, c: CardAccessInfo & { boardAdmin: boolean }) {
  if (!canSeeCard(v, c)) return false;
  if (!c.clientLinked || v.allTasks || c.boardAdmin) return true;
  return !c.assigneeId || c.assigneeId === v.userId || c.createdById === v.userId || c.memberIds.includes(v.userId);
}

/** Колонка, где карточка стоит на самом деле: выполненная — в «Готово», открытая из «Готово» — в первую; без колонки — первая. */
export function effectiveColumn(columns: readonly { id: string; done: boolean }[], columnId: string | null, done: boolean): string | null {
  if (!columns.length) return null;
  const current = columns.find((c) => c.id === columnId) ?? null;
  const doneCol = columns.find((c) => c.done) ?? null;
  const first = columns.find((c) => !c.done) ?? columns[0];
  if (done) return current?.done ? current.id : (doneCol?.id ?? current?.id ?? first.id);
  if (!current || current.done) return first.id;
  return current.id;
}

/** Событие карточки, на которое отвечают правила доски. */
export type CardEvent = { type: "card.added"; columnId: string | null } | { type: "card.moved"; columnId: string } | { type: "card.overdue" } | { type: "card.done" } | { type: "checklist.completed" };

/** Подходит ли правило событию. */
export function ruleMatches(trigger: BoardRuleTrigger, e: CardEvent): boolean {
  if (trigger.type !== e.type) return false;
  if (trigger.type === "card.moved") return trigger.columnId === (e as { columnId: string }).columnId;
  if (trigger.type === "card.added") return !trigger.columnId || trigger.columnId === (e as { columnId: string | null }).columnId;
  return true;
}

/** Срок из действия set_due: через days дней и hours часов от now; 0/0 — убрать срок. Дни без часов — к 18:00. */
export function ruleDue(now: Date, a: { days: number; hours: number }): Date | null {
  const days = Math.max(0, Math.min(365, Math.floor(a.days || 0)));
  const hours = Math.max(0, Math.min(24 * 30, Math.floor(a.hours || 0)));
  if (!days && !hours) return null;
  const d = new Date(now.getTime() + hours * 3_600_000);
  if (days) {
    d.setDate(d.getDate() + days);
    if (!hours) d.setHours(18, 0, 0, 0);
  }
  return d;
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Проверка правила из формы: известные события и действия, ссылки — uuid; иначе BoardsError("invalid"). */
export function validateRule(trigger: unknown, actions: unknown): { trigger: BoardRuleTrigger; actions: BoardRuleAction[] } {
  const t = trigger as BoardRuleTrigger;
  const bad = () => new BoardsError("invalid", "Правило заполнено не полностью");
  if (!t || typeof t !== "object") throw bad();
  if (t.type === "card.moved" && !UUID.test(t.columnId ?? "")) throw bad();
  if (t.type === "card.added" && t.columnId && !UUID.test(t.columnId)) throw bad();
  if (!["card.added", "card.moved", "card.overdue", "card.done", "checklist.completed"].includes(t.type)) throw bad();
  if (!Array.isArray(actions) || !actions.length || actions.length > 10) throw bad();
  const out: BoardRuleAction[] = [];
  for (const raw of actions as BoardRuleAction[]) {
    switch (raw?.type) {
      case "assign":
        if (raw.userId !== "mover" && !UUID.test(raw.userId)) throw bad();
        out.push({ type: "assign", userId: raw.userId });
        break;
      case "watch":
        if (!UUID.test(raw.userId)) throw bad();
        out.push({ type: "watch", userId: raw.userId });
        break;
      case "unassign":
      case "mark_done":
        out.push({ type: raw.type });
        break;
      case "set_due":
        out.push({ type: "set_due", days: Math.max(0, Math.min(365, Math.floor(Number(raw.days) || 0))), hours: Math.max(0, Math.min(720, Math.floor(Number(raw.hours) || 0))) });
        break;
      case "notify":
        if (!["assignees", "watchers", "user"].includes(raw.to) || (raw.to === "user" && !UUID.test(raw.userId ?? ""))) throw bad();
        out.push({ type: "notify", to: raw.to, userId: raw.to === "user" ? raw.userId : null, text: raw.text?.trim().slice(0, 200) || null });
        break;
      case "add_label":
      case "remove_label":
        if (!UUID.test(raw.labelId)) throw bad();
        out.push({ type: raw.type, labelId: raw.labelId });
        break;
      case "move":
        if (!UUID.test(raw.columnId)) throw bad();
        out.push({ type: "move", columnId: raw.columnId });
        break;
      case "set_priority":
        out.push({ type: "set_priority", priority: raw.priority && ["urgent", "high", "normal", "low"].includes(raw.priority) ? raw.priority : null });
        break;
      case "add_checklist": {
        const items = (Array.isArray(raw.items) ? raw.items : []).map((s) => String(s).trim().slice(0, 300)).filter(Boolean).slice(0, 30);
        if (!raw.title?.trim()) throw bad();
        out.push({ type: "add_checklist", title: raw.title.trim().slice(0, 120), items });
        break;
      }
      default:
        throw bad();
    }
  }
  return { trigger: t.type === "card.moved" ? { type: t.type, columnId: t.columnId } : t.type === "card.added" ? { type: t.type, columnId: t.columnId ?? null } : { type: t.type }, actions: out };
}

/** Фильтр карточек: тот же у доски, списка, календаря и шкалы (из строки адреса). */
export interface CardFilter {
  q?: string;
  /** me — мои (исполнитель или соисполнитель), none — ничьи, uuid — сотрудника. */
  who?: string;
  labels?: string[];
  priority?: string[];
  /** overdue — просрочено, today — сегодня, week — 7 дней, none — без срока. */
  due?: "overdue" | "today" | "week" | "none";
  /** Показывать выполненные (по умолчанию — за 14 дней в колонке «Готово»). */
  done?: boolean;
}

export function parseFilter(sp: Record<string, string | string[] | undefined>): CardFilter {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const many = (k: string) =>
    (one(k) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  const due = one("due");
  const who = one("who");
  return {
    q: one("q")?.trim().slice(0, 100) || undefined,
    who: who === "me" || who === "none" || UUID.test(who ?? "") ? who : undefined,
    labels: many("label").filter((s) => UUID.test(s)),
    priority: many("priority").filter((p) => ["urgent", "high", "normal", "low", "none"].includes(p)),
    due: due === "overdue" || due === "today" || due === "week" || due === "none" ? due : undefined,
    done: one("done") === "1" || undefined,
  };
}

/** Карточка подходит под фильтр (на клиенте и сервере — одно правило). */
export function matchesFilter(
  c: { title: string; assigneeIds: string[]; labelIds: string[]; priority: string | null; dueAt: string | null; doneAt: string | null; linkLabel?: string | null },
  f: CardFilter,
  me: string,
  now: Date,
): boolean {
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!c.title.toLowerCase().includes(q) && !(c.linkLabel ?? "").toLowerCase().includes(q)) return false;
  }
  if (f.who === "me" && !c.assigneeIds.includes(me)) return false;
  if (f.who === "none" && c.assigneeIds.length) return false;
  if (f.who && f.who !== "me" && f.who !== "none" && !c.assigneeIds.includes(f.who)) return false;
  if (f.labels?.length && !f.labels.some((l) => c.labelIds.includes(l))) return false;
  if (f.priority?.length && !f.priority.includes(c.priority ?? "none")) return false;
  if (f.due) {
    const due = c.dueAt ? new Date(c.dueAt) : null;
    const endToday = new Date(now);
    endToday.setHours(24, 0, 0, 0);
    if (f.due === "none" && due) return false;
    if (f.due === "overdue" && !(due && due < now && !c.doneAt)) return false;
    if (f.due === "today" && !(due && due < endToday)) return false;
    if (f.due === "week" && !(due && due.getTime() < endToday.getTime() + 6 * 86_400_000)) return false;
  }
  return true;
}

/** Ключ хранилища вложения карточки. Имя — только безопасные символы. */
export function attachmentKey(taskId: string, id: string, name: string) {
  const ext = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? "bin").toLowerCase();
  return `tasks/${taskId}/${id}.${ext}`;
}

export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENTS_PER_CARD = 40;
