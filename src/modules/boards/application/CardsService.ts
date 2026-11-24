import type { Clock } from "@/shared/application";
import { isBoardColor, isRecurrence, nextOccurrence, positionBetween, type BoardRuleAction, type TaskPriority, type TaskRecurrence } from "@/shared/domain/boards";
import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_CARD, BoardsError, attachmentKey, canManageBoard, effectiveColumn, ruleDue, ruleMatches, type BoardViewer, type CardEvent } from "../domain";
import { BoardsService, cardAccess } from "./BoardsService";
import type { BoardRow, BoardsFiles, BoardsNotifier, BoardsStore, CardPatch, CardRow, ColumnRow, TaskKind } from "./ports";
import { cardDetail, cardSummary, type CardDetail, type CardSummary } from "./views";

/** Напоминание по умолчанию — за час до срока (как у задач CRM). */
const DEFAULT_REMIND_MIN = 60;
/** Сколько правил может сработать подряд на одно действие (правило двигает карточку → правило колонки…). */
const RULE_DEPTH = 3;

const KINDS = new Set(["task", "call", "message", "meeting"]);
const PRIORITIES = new Set(["urgent", "high", "normal", "low"]);

export interface CardCreateInput {
  boardId?: string | null;
  columnId?: string | null;
  title: string;
  kind?: TaskKind;
  description?: string | null;
  dueAt?: string | null;
  startAt?: string | null;
  priority?: TaskPriority | null;
  assigneeIds?: string[];
  labelIds?: string[];
  /** Куда в колонке: наверх или вниз (по умолчанию вниз). */
  at?: "top" | "bottom";
  dealId?: string | null;
  orderId?: string | null;
  clientId?: string | null;
  bookId?: string | null;
  conversationId?: string | null;
  checklist?: { title: string; items: string[] } | null;
}

export interface CardUpdateInput {
  title?: string;
  kind?: TaskKind;
  description?: string | null;
  priority?: TaskPriority | null;
  startAt?: string | null;
  dueAt?: string | null;
  remindBeforeMin?: number | null;
  cover?: string | null;
  estimateMin?: number | null;
  spentMin?: number | null;
  recurrence?: TaskRecurrence | null;
  result?: string | null;
  meet?: boolean;
  dealId?: string | null;
  orderId?: string | null;
  clientId?: string | null;
  bookId?: string | null;
  conversationId?: string | null;
}

/** Действие над несколькими карточками сразу. */
export type BulkAction =
  | { type: "move"; columnId: string }
  | { type: "assign"; userId: string | null }
  | { type: "label"; labelId: string; on: boolean }
  | { type: "done"; done: boolean }
  | { type: "archive"; archived: boolean }
  | { type: "due"; dueAt: string | null }
  | { type: "priority"; priority: TaskPriority | null };

const date = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const d = new Date(raw.length === 10 ? `${raw}T18:00:00` : raw);
  if (Number.isNaN(d.getTime())) throw new BoardsError("invalid", "Неверная дата");
  return d;
};

const titleOf = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ").slice(0, 200);
  if (!t) throw new BoardsError("invalid", "Введите название карточки");
  return t;
};

const minutes = (n: number | null | undefined) => (n == null || !Number.isFinite(n) || n <= 0 ? null : Math.min(100_000, Math.round(n)));

/** Кто действует: сотрудник или правило доски (actor null — в журнале «Автоматизация»). */
type Actor = { viewer: BoardViewer | null; userId: string | null; name: string };

/**
 * Карточки досок: создание, правка, перенос, исполнители, метки, чек-листы, комментарии, вложения, архив, массовые
 * действия, правила досок и повторы. Карточка — задача CRM (crm_tasks): «Мой день», напоминания и правила CRM
 * работают с ней как раньше.
 */
export class CardsService {
  constructor(
    private readonly store: BoardsStore,
    private readonly boards: BoardsService,
    private readonly notifier: BoardsNotifier,
    private readonly files: BoardsFiles,
    private readonly clock: Clock,
  ) {}

  private link = (id: string) => `/admin/tasks/${id}`;

  /** Доска карточки (задача без доски — на доске по умолчанию). */
  private async boardOf(c: CardRow, userId: string): Promise<BoardRow | null> {
    return c.boardId ? this.store.board(c.boardId, userId) : this.store.defaultBoard();
  }

  /** Карточка, которую зритель видит; edit — и может менять. */
  private async load(v: BoardViewer, id: string, edit = true) {
    const c = await this.store.card(id);
    if (!c) throw new BoardsError("notFound", "Карточка не найдена");
    const board = await this.boardOf(c, v.userId);
    if (board) await this.boards.visible(v, board.id);
    const admin = board ? canManageBoard(v, board) : v.manageBoards;
    const a = cardAccess(v, c, admin);
    if (!a.see) throw new BoardsError("notFound", "Карточка не найдена");
    if (edit && !a.edit) throw new BoardsError("forbidden", "Эту карточку может менять её исполнитель, автор или руководитель");
    return { card: c, board, admin, editable: a.edit };
  }

  private actor(v: BoardViewer): Actor {
    return { viewer: v, userId: v.userId, name: v.name };
  }

  async summary(v: BoardViewer, id: string): Promise<CardSummary> {
    const { card, board, editable } = await this.load(v, id, false);
    const cols = board ? await this.store.columns(board.id) : [];
    return cardSummary(card, effectiveColumn(cols, card.columnId, !!card.doneAt), editable);
  }

  async detail(v: BoardViewer, id: string): Promise<CardDetail> {
    const { card, board, editable } = await this.load(v, id, false);
    const [cols, labels, checklists, comments, files, activity, meetUrl] = await Promise.all([
      board ? this.store.columns(board.id) : [],
      board ? this.store.labels(board.id) : [],
      this.store.checklists(card.id),
      this.store.comments(card.id),
      this.store.attachments(card.id),
      this.store.activity(card.id, 100),
      card.meet ? this.store.meetUrl(card.id) : null,
    ]);
    const s = cardSummary(card, effectiveColumn(cols, card.columnId, !!card.doneAt), editable);
    return cardDetail(card, s, { meetUrl, board: board ? { id: board.id, name: board.name } : null, columns: cols, labels, checklists, comments, files, activity, me: v.userId });
  }

  // ─── Создание ───

  async create(v: BoardViewer, input: CardCreateInput): Promise<string> {
    const board = input.boardId ? await this.boards.visible(v, input.boardId) : await this.store.defaultBoard();
    if (!board) throw new BoardsError("notFound", "Доска не найдена");
    const cols = await this.store.columns(board.id);
    const col = (input.columnId && cols.find((c) => c.id === input.columnId)) || cols.find((c) => !c.done) || cols[0];
    if (!col) throw new BoardsError("invalid", "На доске нет колонок");
    const assignees = await this.store.activeStaff(input.assigneeIds ?? []);
    // «Только свои» на карточке о клиенте ставят задачи себе (как в «Задачах»).
    const linked = !!(input.dealId || input.orderId || input.clientId || input.conversationId);
    if (linked && !v.seesAll && assignees.some((a) => a !== v.userId)) throw new BoardsError("forbidden", "Назначать задачи по клиентам коллегам может роль с доступом ко всем записям");
    const dueAt = date(input.dueAt);
    const ids = (await this.store.columnPositions(board.id, board.isDefault, col.id)).filter((x) => x.position != null);
    const position = input.at === "top" ? positionBetween(null, ids[0]?.position ?? null) : positionBetween(ids.at(-1)?.position ?? null, null);
    const id = await this.store.insertCard({
      title: titleOf(input.title),
      kind: input.kind && KINDS.has(input.kind) ? input.kind : "task",
      boardId: board.id,
      columnId: col.id,
      position,
      description: input.description?.trim().slice(0, 20_000) || null,
      priority: input.priority && PRIORITIES.has(input.priority) ? input.priority : null,
      startAt: date(input.startAt),
      dueAt,
      remindBeforeMin: dueAt ? DEFAULT_REMIND_MIN : null,
      assigneeId: assignees[0] ?? (linked ? v.userId : null),
      createdById: v.userId,
      dealId: input.dealId ?? null,
      orderId: input.orderId ?? null,
      clientId: input.clientId ?? null,
      bookId: input.bookId ?? null,
      conversationId: input.conversationId ?? null,
      doneAt: col.done ? this.clock.now() : null,
    });
    if (assignees.length > 1) await this.store.setMembers(id, "assignee", assignees.slice(1));
    const labels = new Set((await this.store.labels(board.id)).map((l) => l.id));
    for (const l of input.labelIds ?? []) if (labels.has(l)) await this.store.addLabel2(id, l, false);
    if (input.checklist?.title.trim()) await this.store.addChecklist(id, input.checklist.title.trim().slice(0, 120), input.checklist.items.map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 50));
    await this.store.log(id, v.userId, "created", { board: board.name, column: col.name });
    const title = titleOf(input.title);
    const others = assignees.filter((a) => a !== v.userId);
    if (others.length) await this.notifier.notify(others, { kind: "task", title: `«${title}»`, body: `${v.name} назначил(а) вас на карточку · ${board.name}`, link: this.link(id) }).catch(() => {});
    await this.fire(id, { type: "card.added", columnId: col.id }, this.actor(v), 0);
    return id;
  }

  /**
   * Карточка от правила CRM («сделка перешла на этап → карточка на доске производства»): без автора, исполнитель — если
   * задан и действует. Одна открытая карточка с этим заголовком на сделку и доску — повтор события её не дублирует.
   * null — такая уже есть или доски нет.
   */
  async createFromRule(input: { boardId: string; columnId?: string | null; title: string; dealId?: string | null; clientId?: string | null; orderId?: string | null; assigneeId?: string | null; dueAt?: Date | null; checklist?: { title: string; items: string[] } | null }): Promise<string | null> {
    const board = await this.store.board(input.boardId, "00000000-0000-0000-0000-000000000000");
    if (!board || board.archivedAt) return null;
    const title = titleOf(input.title);
    if (input.dealId) {
      const existing = (await this.store.cards(board.id, board.isDefault, { doneSince: null })).find((c) => c.dealId === input.dealId && c.title === title && !c.doneAt);
      if (existing) return null;
    }
    const cols = await this.store.columns(board.id);
    const col = (input.columnId && cols.find((c) => c.id === input.columnId)) || cols.find((c) => !c.done) || cols[0];
    if (!col) return null;
    const [assignee] = input.assigneeId ? await this.store.activeStaff([input.assigneeId]) : [];
    const ids = (await this.store.columnPositions(board.id, board.isDefault, col.id)).filter((x) => x.position != null);
    const id = await this.store.insertCard({
      title,
      kind: "task",
      boardId: board.id,
      columnId: col.id,
      position: positionBetween(ids.at(-1)?.position ?? null, null),
      dueAt: input.dueAt ?? null,
      remindBeforeMin: input.dueAt ? DEFAULT_REMIND_MIN : null,
      assigneeId: assignee ?? null,
      createdById: null,
      dealId: input.dealId ?? null,
      clientId: input.clientId ?? null,
      orderId: input.orderId ?? null,
    });
    if (input.checklist?.title.trim()) await this.store.addChecklist(id, input.checklist.title.trim().slice(0, 120), input.checklist.items.map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 50));
    await this.store.log(id, null, "created", { board: board.name, column: col.name, rule: true });
    await this.fire(id, { type: "card.added", columnId: col.id }, { viewer: null, userId: null, name: "Автоматизация" }, 0);
    return id;
  }

  /**
   * Перенос от правила CRM («заказ в печати → колонка „Печать“»): открытые карточки этого заказа (иначе — сделки) на
   * доске — в колонку, с правилами доски. false — таких карточек нет.
   */
  async moveFromRule(input: { boardId: string; columnId: string; orderId: string | null; dealId: string | null }): Promise<boolean> {
    if (!input.orderId && !input.dealId) return false;
    const board = await this.store.board(input.boardId, "00000000-0000-0000-0000-000000000000");
    if (!board || board.archivedAt) return false;
    const all = await this.store.cards(board.id, board.isDefault, { doneSince: new Date(this.clock.now().getTime() - 30 * 86_400_000) });
    const byOrder = input.orderId ? all.filter((c) => c.orderId === input.orderId) : [];
    const list = byOrder.length ? byOrder : input.dealId ? all.filter((c) => c.dealId === input.dealId) : [];
    for (const c of list) if (c.columnId !== input.columnId) await this.moveInternal(c, board, { columnId: input.columnId }, { viewer: null, userId: null, name: "Автоматизация" }, 0);
    return list.length > 0;
  }

  // ─── Правка ───

  async update(v: BoardViewer, id: string, patch: CardUpdateInput) {
    const { card } = await this.load(v, id);
    const next: CardPatch = {};
    const log: Record<string, unknown> = {};
    if (patch.title !== undefined && titleOf(patch.title) !== card.title) next.title = log.title = titleOf(patch.title);
    if (patch.kind !== undefined && KINDS.has(patch.kind)) next.kind = patch.kind;
    if (patch.description !== undefined) {
      next.description = patch.description?.trim().slice(0, 20_000) || null;
      log.description = true;
    }
    if (patch.priority !== undefined) next.priority = log.priority = patch.priority && PRIORITIES.has(patch.priority) ? patch.priority : null;
    if (patch.startAt !== undefined) next.startAt = date(patch.startAt);
    if (patch.dueAt !== undefined) {
      next.dueAt = date(patch.dueAt);
      log.dueAt = next.dueAt?.toISOString() ?? null;
      // Срок появился — напоминание за час; убрали — не о чем напоминать. Новый срок — напоминание и просрочка заново.
      if (patch.remindBeforeMin === undefined) next.remindBeforeMin = next.dueAt ? (card.dueAt ? (card.remindBeforeMin ?? null) : DEFAULT_REMIND_MIN) : null;
      next.remindedAt = null;
      next.overdueNotifiedAt = null;
    }
    if (patch.remindBeforeMin !== undefined) {
      next.remindBeforeMin = patch.remindBeforeMin == null ? null : Math.max(0, Math.min(7 * 24 * 60, Math.round(patch.remindBeforeMin)));
      next.remindedAt = null;
    }
    if (patch.cover !== undefined) {
      if (patch.cover === null || isBoardColor(patch.cover)) next.cover = patch.cover;
      else if (patch.cover.startsWith("att:")) {
        const att = await this.store.attachment(patch.cover.slice(4));
        if (!att || att.taskId !== card.id || !att.mime.startsWith("image/")) throw new BoardsError("invalid", "Обложка — картинка из вложений карточки");
        next.cover = patch.cover;
      }
    }
    if (patch.estimateMin !== undefined) next.estimateMin = minutes(patch.estimateMin);
    if (patch.spentMin !== undefined) next.spentMin = minutes(patch.spentMin);
    if (patch.recurrence !== undefined) {
      if (patch.recurrence !== null && !isRecurrence(patch.recurrence)) throw new BoardsError("invalid", "Неверный повтор");
      next.recurrence = log.recurrence = patch.recurrence;
    }
    if (patch.result !== undefined) next.result = patch.result?.trim().slice(0, 500) || null;
    if (patch.meet !== undefined) next.meet = !!patch.meet;
    for (const k of ["dealId", "orderId", "clientId", "bookId", "conversationId"] as const) {
      if (patch[k] === undefined) continue;
      const val = patch[k];
      if (val !== null && !/^[0-9a-f-]{36}$/i.test(val)) throw new BoardsError("invalid", "Неверная связь");
      next[k] = val;
      log.links = true;
    }
    if (!Object.keys(next).length) return;
    await this.store.updateCard(card.id, next);
    if (next.dueAt !== undefined && next.dueAt && next.dueAt > this.clock.now()) await this.store.removeAutoLabels(card.id);
    if (Object.keys(log).length) await this.store.log(card.id, v.userId, "updated", log);
  }

  /** Исполнители: первый — главный (напоминания, «Мой день»), остальные — соисполнители. Новым — уведомление. */
  async setAssignees(v: BoardViewer, id: string, userIds: string[]) {
    const { card, board } = await this.load(v, id);
    const ids = await this.store.activeStaff(userIds.slice(0, 20));
    const ordered = userIds.filter((u) => ids.includes(u));
    const linked = !!(card.dealId || card.orderId || card.clientId || card.conversationId);
    const before = new Set([card.assigneeId, ...card.members.filter((m) => m.role === "assignee").map((m) => m.userId)].filter(Boolean) as string[]);
    if (linked && !v.seesAll && ordered.some((u) => u !== v.userId && !before.has(u))) throw new BoardsError("forbidden", "Назначать задачи по клиентам коллегам может роль с доступом ко всем записям");
    const main = ordered[0] ?? null;
    if (main !== card.assigneeId) await this.store.updateCard(card.id, { assigneeId: main, remindedAt: null });
    await this.store.setMembers(card.id, "assignee", ordered.slice(1));
    await this.store.touch(card.id);
    const added = ordered.filter((u) => !before.has(u));
    const removed = [...before].filter((u) => !ordered.includes(u));
    if (added.length || removed.length) await this.store.log(card.id, v.userId, "assignees", { added, removed });
    const notify = added.filter((u) => u !== v.userId);
    if (notify.length) await this.notifier.notify(notify, { kind: "task", title: `«${card.title}»`, body: `${v.name} назначил(а) вас на карточку${board ? ` · ${board.name}` : ""}`, link: this.link(card.id) }).catch(() => {});
  }

  /** Наблюдать или нет (сам за себя; других добавляет тот, кто может менять карточку). */
  async setWatching(v: BoardViewer, id: string, userId: string, on: boolean) {
    const { card } = await this.load(v, id, userId !== v.userId);
    if (on && !(await this.store.activeStaff([userId])).length) throw new BoardsError("notFound", "Сотрудник не найден");
    if (on) await this.store.addMember(card.id, userId, "watcher");
    else await this.store.removeMember(card.id, userId, "watcher");
    await this.store.touch(card.id);
  }

  async setLabel(v: BoardViewer, id: string, labelId: string, on: boolean) {
    const { card, board } = await this.load(v, id);
    if (!board || !(await this.store.labels(board.id)).some((l) => l.id === labelId)) throw new BoardsError("notFound", "Метка не найдена");
    const changed = on ? await this.store.addLabel2(card.id, labelId, false) : await this.store.removeLabel2(card.id, labelId);
    if (changed) {
      await this.store.touch(card.id);
      await this.store.log(card.id, v.userId, on ? "label.added" : "label.removed", { labelId });
    }
  }

  /**
   * Перенос карточки: в колонку columnId (на той же или другой доске) между соседями beforeId и afterId (id карточек
   * колонки после переноса). В «Готово» — выполнена (с правилами «выполнили»), из «Готово» — снова открыта.
   */
  async move(v: BoardViewer, id: string, to: { boardId?: string | null; columnId: string; beforeId?: string | null; afterId?: string | null }) {
    const { card, board } = await this.load(v, id);
    const target = to.boardId && to.boardId !== board?.id ? await this.boards.visible(v, to.boardId) : board;
    if (!target) throw new BoardsError("notFound", "Доска не найдена");
    return this.moveInternal(card, target, to, this.actor(v), 0);
  }

  private async moveInternal(card: CardRow, target: BoardRow, to: { columnId: string; beforeId?: string | null; afterId?: string | null }, actor: Actor, depth: number) {
    const cols = await this.store.columns(target.id);
    const col = cols.find((c) => c.id === to.columnId);
    if (!col) throw new BoardsError("notFound", "Колонка не найдена");
    const fromCol = card.boardId === target.id || (!card.boardId && target.isDefault) ? effectiveColumn(cols, card.columnId, !!card.doneAt) : null;
    const neighbours = await this.store.columnPositions(target.id, target.isDefault, col.id);
    const list = neighbours.filter((n) => n.id !== card.id);
    // Карточки без позиции (задачи из сделок) расставляются по порядку, как их видно, — тогда вставка между ними точна.
    if (list.some((n) => n.position == null)) {
      await this.store.renumber(list.map((n) => n.id));
      list.forEach((n, i) => (n.position = (i + 1) * 1024));
    }
    const before = to.beforeId ? list.find((n) => n.id === to.beforeId) : null;
    const after = to.afterId ? list.find((n) => n.id === to.afterId) : null;
    let position: number;
    if (before || after) position = positionBetween(before?.position ?? null, after?.position ?? null);
    else position = positionBetween(list.at(-1)?.position ?? null, null);
    if (before && after && Math.abs((after.position ?? 0) - (before.position ?? 0)) < 1e-6) {
      const ids = list.map((n) => n.id);
      await this.store.renumber(ids);
      position = (ids.indexOf(before.id) + 1) * 1024 + 512;
    }
    const now = this.clock.now();
    const patch: CardPatch = { boardId: target.id, columnId: col.id, position };
    const becameDone = col.done && !card.doneAt;
    const reopened = !col.done && !!card.doneAt;
    if (becameDone) Object.assign(patch, { doneAt: now, doneById: actor.userId });
    if (reopened) Object.assign(patch, { doneAt: null, doneById: null, recurSpawnedAt: null });
    if (card.boardId !== target.id) {
      // На другой доске метки этой доски не нужны — снимаются.
      const keep = new Set((await this.store.labels(target.id)).map((l) => l.id));
      for (const l of card.labels) if (!keep.has(l.id)) await this.store.removeLabel2(card.id, l.id);
    }
    await this.store.updateCard(card.id, patch);
    if (becameDone) await this.store.removeAutoLabels(card.id);
    if (fromCol !== col.id) {
      const fromName = cols.find((c) => c.id === fromCol)?.name ?? null;
      await this.store.log(card.id, actor.userId, "moved", { from: fromName, to: col.name, board: card.boardId !== target.id ? target.name : undefined });
      await this.fire(card.id, { type: "card.moved", columnId: col.id }, actor, depth);
    }
    if (becameDone) await this.fire(card.id, { type: "card.done" }, actor, depth);
  }

  /** Выполнить или вернуть в работу: в колонку «Готово» доски или из неё (в первую). Без доски — только отметка. */
  async setDone(v: BoardViewer, id: string, done: boolean, result?: string | null) {
    const { card, board } = await this.load(v, id);
    await this.setDoneInternal(card, board, done, this.actor(v), 0);
    if (done && result?.trim()) await this.store.updateCard(card.id, { result: result.trim().slice(0, 500) });
  }

  private async setDoneInternal(card: CardRow, board: BoardRow | null, done: boolean, actor: Actor, depth: number) {
    if (!!card.doneAt === done) return;
    const cols = board ? await this.store.columns(board.id) : [];
    const col = done ? cols.find((c) => c.done) : cols.find((c) => !c.done);
    if (board && col) return this.moveInternal(card, board, { columnId: col.id }, actor, depth);
    await this.store.updateCard(card.id, done ? { doneAt: this.clock.now(), doneById: actor.userId } : { doneAt: null, doneById: null, recurSpawnedAt: null });
    await this.store.log(card.id, actor.userId, done ? "done" : "reopened");
    if (done) {
      await this.store.removeAutoLabels(card.id);
      await this.fire(card.id, { type: "card.done" }, actor, depth);
    }
  }

  async archive(v: BoardViewer, id: string, archived: boolean) {
    const { card } = await this.load(v, id);
    await this.store.updateCard(card.id, { archivedAt: archived ? this.clock.now() : null });
    await this.store.log(card.id, v.userId, archived ? "archived" : "restored");
  }

  /** Удалить насовсем: автор, руководитель досок или админ доски. Вложения удаляются из хранилища. */
  async remove(v: BoardViewer, id: string) {
    const { card, admin } = await this.load(v, id);
    if (!admin && card.createdById !== v.userId && !v.allTasks) throw new BoardsError("forbidden", "Удалить карточку может её автор или админ доски; остальные — в архив");
    const files = await this.store.attachments(card.id);
    await this.store.deleteCard(card.id);
    for (const f of files) await this.files.remove(f.storageKey).catch(() => {});
  }

  /** Копия карточки (с чек-листами и метками) в ту же колонку. */
  async duplicate(v: BoardViewer, id: string) {
    const { card, board } = await this.load(v, id, false);
    const copy = await this.create(v, { boardId: board?.id ?? null, columnId: card.columnId, title: `${card.title} (копия)`, kind: card.kind, description: card.description, priority: card.priority, dueAt: card.dueAt?.toISOString() ?? null, startAt: card.startAt?.toISOString() ?? null, labelIds: card.labels.filter((l) => !l.auto).map((l) => l.id), dealId: card.dealId, orderId: card.orderId, clientId: card.clientId, bookId: card.bookId, conversationId: card.conversationId });
    for (const l of await this.store.checklists(card.id))
      await this.store.addChecklist(
        copy,
        l.title,
        l.items.map((i) => i.text),
      );
    return copy;
  }

  async bulk(v: BoardViewer, ids: string[], action: BulkAction): Promise<{ done: number; failed: number }> {
    let done = 0;
    let failed = 0;
    for (const id of [...new Set(ids)].slice(0, 200)) {
      try {
        switch (action.type) {
          case "move": {
            const { card, board } = await this.load(v, id);
            if (!board) throw new BoardsError("notFound");
            await this.moveInternal(card, board, { columnId: action.columnId }, this.actor(v), 0);
            break;
          }
          case "assign":
            await this.setAssignees(v, id, action.userId ? [action.userId] : []);
            break;
          case "label":
            await this.setLabel(v, id, action.labelId, action.on);
            break;
          case "done":
            await this.setDone(v, id, action.done);
            break;
          case "archive":
            await this.archive(v, id, action.archived);
            break;
          case "due":
            await this.update(v, id, { dueAt: action.dueAt });
            break;
          case "priority":
            await this.update(v, id, { priority: action.priority });
            break;
        }
        done++;
      } catch {
        failed++;
      }
    }
    return { done, failed };
  }

  // ─── Чек-листы ───

  async addChecklist(v: BoardViewer, id: string, title: string, items: string[] = []) {
    const { card } = await this.load(v, id);
    const t = title.trim().slice(0, 120) || "Чек-лист";
    const listId = await this.store.addChecklist(card.id, t, items.map((s) => s.trim().slice(0, 300)).filter(Boolean).slice(0, 50));
    await this.store.touch(card.id);
    await this.store.log(card.id, v.userId, "checklist.added", { title: t });
    return listId;
  }

  async renameChecklist(v: BoardViewer, checklistId: string, title: string) {
    const l = await this.store.checklistOf(checklistId);
    if (!l) throw new BoardsError("notFound", "Чек-лист не найден");
    await this.load(v, l.taskId);
    await this.store.renameChecklist(l.id, title.trim().slice(0, 120) || "Чек-лист");
    await this.store.touch(l.taskId);
  }

  async deleteChecklist(v: BoardViewer, checklistId: string) {
    const l = await this.store.checklistOf(checklistId);
    if (!l) throw new BoardsError("notFound", "Чек-лист не найден");
    await this.load(v, l.taskId);
    await this.store.deleteChecklist(l.id);
    await this.store.touch(l.taskId);
  }

  async addItem(v: BoardViewer, checklistId: string, text: string) {
    const l = await this.store.checklistOf(checklistId);
    if (!l) throw new BoardsError("notFound", "Чек-лист не найден");
    await this.load(v, l.taskId);
    const t = text.trim().slice(0, 300);
    if (!t) throw new BoardsError("invalid", "Введите пункт");
    const itemId = await this.store.addItem(l.id, t);
    await this.store.touch(l.taskId);
    return itemId;
  }

  /** Пункт чек-листа: текст, отметка, исполнитель, срок. Все пункты отмечены — правила «чек-лист выполнен». */
  async updateItem(v: BoardViewer, itemId: string, patch: { text?: string; done?: boolean; assigneeId?: string | null; dueAt?: string | null }) {
    const item = await this.store.itemOf(itemId);
    if (!item) throw new BoardsError("notFound", "Пункт не найден");
    const { card } = await this.load(v, item.taskId);
    const next: Parameters<BoardsStore["updateItem"]>[1] = {};
    if (patch.text !== undefined) next.text = patch.text.trim().slice(0, 300) || item.text;
    if (patch.done !== undefined) Object.assign(next, patch.done ? { doneAt: this.clock.now(), doneById: v.userId } : { doneAt: null, doneById: null });
    if (patch.assigneeId !== undefined) {
      if (patch.assigneeId && !(await this.store.activeStaff([patch.assigneeId])).length) throw new BoardsError("notFound", "Сотрудник не найден");
      next.assigneeId = patch.assigneeId;
    }
    if (patch.dueAt !== undefined) next.dueAt = date(patch.dueAt);
    await this.store.updateItem(item.id, next);
    await this.store.touch(item.taskId);
    if (patch.done !== undefined && patch.done !== !!item.doneAt) await this.store.log(item.taskId, v.userId, patch.done ? "item.done" : "item.undone", { text: item.text });
    if (patch.assigneeId && patch.assigneeId !== v.userId) await this.notifier.notify([patch.assigneeId], { kind: "task", title: `«${card.title}»`, body: `${v.name}: вам пункт чек-листа «${item.text}»`, link: this.link(card.id) }).catch(() => {});
    if (patch.done) {
      const all = (await this.store.checklists(item.taskId)).flatMap((l) => l.items);
      if (all.length && all.every((i) => i.doneAt)) await this.fire(item.taskId, { type: "checklist.completed" }, this.actor(v), 0);
    }
  }

  async deleteItem(v: BoardViewer, itemId: string) {
    const item = await this.store.itemOf(itemId);
    if (!item) throw new BoardsError("notFound", "Пункт не найден");
    await this.load(v, item.taskId);
    await this.store.deleteItem(item.id);
    await this.store.touch(item.taskId);
  }

  // ─── Комментарии ───

  /** Комментарий: @упомянутым — уведомление об упоминании, исполнителям и наблюдателям — одно на карточку, пока не прочитано. */
  async comment(v: BoardViewer, id: string, text: string) {
    const { card } = await this.load(v, id, false);
    const t = text.trim().slice(0, 5000);
    if (!t) throw new BoardsError("invalid", "Введите комментарий");
    const commentId = await this.store.addComment(card.id, v.userId, t);
    await this.store.touch(card.id);
    const link = this.link(card.id);
    const mentioned = await this.notifier.mentions(t, v.userId, v.name, link, `карточка «${card.title}»`).catch(() => [] as string[]);
    // Упомянутым уже пришло «упомянул(а) вас» — второе уведомление о том же комментарии им не нужно.
    const people = [card.assigneeId, card.createdById, ...card.members.map((m) => m.userId)].filter((u): u is string => !!u && u !== v.userId && !mentioned.includes(u));
    if (people.length) await this.notifier.notify([...new Set(people)], { kind: "task", title: `«${card.title}»`, body: `${v.name}: ${t.slice(0, 200)}`, link }).catch(() => {});
    return commentId;
  }

  async editComment(v: BoardViewer, commentId: string, text: string) {
    const c = await this.store.comment(commentId);
    if (!c) throw new BoardsError("notFound", "Комментарий не найден");
    if (c.authorId !== v.userId) throw new BoardsError("forbidden", "Менять можно только свой комментарий");
    const t = text.trim().slice(0, 5000);
    if (!t) throw new BoardsError("invalid", "Введите комментарий");
    await this.store.editComment(c.id, t, this.clock.now());
    await this.store.touch(c.taskId);
  }

  async deleteComment(v: BoardViewer, commentId: string) {
    const c = await this.store.comment(commentId);
    if (!c) throw new BoardsError("notFound", "Комментарий не найден");
    const { admin } = await this.load(v, c.taskId, false);
    if (c.authorId !== v.userId && !admin) throw new BoardsError("forbidden", "Удалить можно свой комментарий");
    await this.store.deleteComment(c.id);
    await this.store.touch(c.taskId);
  }

  // ─── Вложения ───

  async attach(v: BoardViewer, id: string, file: { name: string; type: string; data: Uint8Array }) {
    const { card } = await this.load(v, id);
    if (file.data.byteLength > ATTACHMENT_MAX_BYTES) throw new BoardsError("tooLarge", "Файл больше 25 МБ");
    if ((await this.store.attachments(card.id)).length >= ATTACHMENTS_PER_CARD) throw new BoardsError("invalid", `У карточки уже ${ATTACHMENTS_PER_CARD} вложений`);
    const attId = crypto.randomUUID();
    const name = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(-150) || "файл";
    const key = attachmentKey(card.id, attId, name);
    await this.files.put(key, file.data);
    const mime = (file.type || "application/octet-stream").slice(0, 100);
    await this.store.addAttachment({ id: attId, taskId: card.id, storageKey: key, name, mime, size: file.data.byteLength, uploadedById: v.userId });
    // Первая картинка — обложкой, если обложки ещё нет.
    if (!card.cover && /^image\/(png|jpe?g|webp|gif)$/.test(mime)) await this.store.updateCard(card.id, { cover: `att:${attId}` });
    else await this.store.touch(card.id);
    await this.store.log(card.id, v.userId, "file.added", { name });
    return attId;
  }

  async detach(v: BoardViewer, id: string, attachmentId: string) {
    const { card } = await this.load(v, id);
    const a = await this.store.attachment(attachmentId);
    if (!a || a.taskId !== card.id) throw new BoardsError("notFound", "Вложение не найдено");
    await this.store.deleteAttachment(a.id);
    if (card.cover === `att:${a.id}`) await this.store.updateCard(card.id, { cover: null });
    else await this.store.touch(card.id);
    await this.files.remove(a.storageKey).catch(() => {});
    await this.store.log(card.id, v.userId, "file.removed", { name: a.name });
  }

  /** Вложение для отдачи файлом: права — как на просмотр карточки. */
  async file(v: BoardViewer, id: string, attachmentId: string) {
    const { card } = await this.load(v, id, false);
    const a = await this.store.attachment(attachmentId);
    if (!a || a.taskId !== card.id) throw new BoardsError("notFound", "Вложение не найдено");
    return a;
  }

  // ─── Правила досок ───

  /** Правила доски карточки на событие: действия по очереди; сбой одного правила не мешает остальным. */
  private async fire(taskId: string, e: CardEvent, actor: Actor, depth: number) {
    if (depth >= RULE_DEPTH) return;
    const card = await this.store.card(taskId);
    if (!card) return;
    const board = await this.boardOf(card, "00000000-0000-0000-0000-000000000000");
    if (!board) return;
    const rules = (await this.store.rules(board.id)).filter((r) => r.enabled && ruleMatches(r.trigger, e));
    for (const rule of rules) {
      try {
        for (const a of rule.actions) await this.apply(taskId, board, a, actor, depth + 1);
        await this.store.ruleFired(rule.id, this.clock.now());
        await this.store.log(taskId, null, "rule", { name: rule.name });
      } catch (err) {
        console.error(`[boards] правило «${rule.name}»`, err);
      }
    }
  }

  private async apply(taskId: string, board: BoardRow, a: BoardRuleAction, actor: Actor, depth: number) {
    const card = await this.store.card(taskId);
    if (!card) return;
    const link = this.link(card.id);
    switch (a.type) {
      case "assign": {
        const who = a.userId === "mover" ? actor.userId : a.userId;
        if (!who || !(await this.store.activeStaff([who])).length) return;
        if (card.assigneeId === who) return;
        if (!card.assigneeId) await this.store.updateCard(card.id, { assigneeId: who, remindedAt: null });
        else await this.store.addMember(card.id, who, "assignee");
        await this.store.touch(card.id);
        if (who !== actor.userId) await this.notifier.notify([who], { kind: "task", title: `«${card.title}»`, body: `Вас назначили на карточку · ${board.name}`, link }).catch(() => {});
        return;
      }
      case "unassign":
        await this.store.updateCard(card.id, { assigneeId: null });
        await this.store.setMembers(card.id, "assignee", []);
        return;
      case "watch":
        if ((await this.store.activeStaff([a.userId])).length) await this.store.addMember(card.id, a.userId, "watcher");
        await this.store.touch(card.id);
        return;
      case "set_due": {
        const due = ruleDue(this.clock.now(), a);
        await this.store.updateCard(card.id, { dueAt: due, remindBeforeMin: due ? DEFAULT_REMIND_MIN : null, remindedAt: null, overdueNotifiedAt: null });
        if (due) await this.store.removeAutoLabels(card.id);
        return;
      }
      case "notify": {
        const to = a.to === "user" ? [a.userId] : a.to === "watchers" ? card.members.filter((m) => m.role === "watcher").map((m) => m.userId) : [card.assigneeId, ...card.members.filter((m) => m.role === "assignee").map((m) => m.userId)];
        const col = (await this.store.columns(board.id)).find((c) => c.id === card.columnId);
        const body = a.text?.trim() || (col ? `Карточка в колонке «${col.name}» · ${board.name}` : board.name);
        await this.notifier.notify(to.filter((u): u is string => !!u && u !== actor.userId), { kind: "task", title: `«${card.title}»`, body, link }).catch(() => {});
        return;
      }
      case "add_label":
        if (await this.store.addLabel2(card.id, a.labelId, actor.userId === null)) await this.store.touch(card.id);
        return;
      case "remove_label":
        if (await this.store.removeLabel2(card.id, a.labelId)) await this.store.touch(card.id);
        return;
      case "move":
        if (card.columnId !== a.columnId) await this.moveInternal(card, board, { columnId: a.columnId }, actor, depth);
        return;
      case "mark_done":
        await this.setDoneInternal(card, board, true, actor, depth);
        return;
      case "set_priority":
        await this.store.updateCard(card.id, { priority: a.priority });
        return;
      case "add_checklist": {
        const lists = await this.store.checklists(card.id);
        if (lists.some((l) => l.title === a.title)) return;
        await this.store.addChecklist(card.id, a.title, a.items);
        await this.store.touch(card.id);
        return;
      }
    }
  }

  /**
   * Проход планировщика «срок прошёл»: правило доски срабатывает один раз на карточку и срок (перенесли срок — снова).
   * Плюс уборка: метки, поставленные правилом, снимаются, когда срок перенесли вперёд или карточку выполнили.
   */
  async sweepOverdue(limit = 200): Promise<number> {
    const now = this.clock.now();
    let fired = 0;
    for (const id of await this.store.resolvedAutoLabels(now, limit)) if (await this.store.removeAutoLabels(id)) await this.store.touch(id);
    for (const c of await this.store.overdueCards(now, limit)) {
      const key = c.dueAt.toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const rules = (await this.store.rules(c.boardId)).filter((r) => r.enabled && r.trigger.type === "card.overdue");
      const board = await this.store.board(c.boardId, "00000000-0000-0000-0000-000000000000");
      if (!board) continue;
      for (const rule of rules) {
        if (!(await this.store.claimRuleRun(rule.id, c.taskId, key))) continue;
        try {
          for (const a of rule.actions) await this.apply(c.taskId, board, a, { viewer: null, userId: null, name: "Автоматизация" }, 1);
          await this.store.ruleFired(rule.id, now);
          fired++;
        } catch (err) {
          console.error(`[boards] правило «${rule.name}»`, err);
        }
      }
    }
    return fired;
  }

  /** Повторы: выполненная карточка с повтором даёт следующую — тот же заголовок, исполнители, метки, чек-листы (снятые). */
  async spawnRecurring(limit = 100): Promise<number> {
    let made = 0;
    for (const c of await this.store.recurringDone(limit)) {
      const now = this.clock.now();
      await this.store.updateCard(c.id, { recurSpawnedAt: now });
      if (!c.recurrence) continue;
      let due = c.dueAt ? nextOccurrence(c.dueAt, c.recurrence) : null;
      // Срок следующей не в прошлом: выполнили с опозданием — от сегодня.
      while (due && due < now) due = nextOccurrence(due, c.recurrence);
      if (c.dueAt && !due) continue;
      const shift = c.dueAt && due ? due.getTime() - c.dueAt.getTime() : 0;
      const board = c.boardId ? await this.store.board(c.boardId, "00000000-0000-0000-0000-000000000000") : await this.store.defaultBoard();
      const cols: ColumnRow[] = board ? await this.store.columns(board.id) : [];
      const first = cols.find((x) => !x.done) ?? null;
      const id = await this.store.insertCard({
        title: c.title,
        kind: c.kind,
        boardId: board?.id ?? null,
        columnId: first?.id ?? null,
        position: null,
        description: c.description,
        priority: c.priority,
        startAt: c.startAt && shift ? new Date(c.startAt.getTime() + shift) : null,
        dueAt: due,
        remindBeforeMin: due ? (c.remindBeforeMin ?? DEFAULT_REMIND_MIN) : null,
        assigneeId: c.assigneeId,
        createdById: c.createdById,
        dealId: c.dealId,
        orderId: c.orderId,
        clientId: c.clientId,
        bookId: c.bookId,
        conversationId: c.conversationId,
        recurrence: c.recurrence,
        estimateMin: c.estimateMin,
        cover: c.cover?.startsWith("att:") ? null : c.cover,
        meet: c.meet,
      });
      await this.store.updateCard(c.id, { recurrence: null });
      for (const m of c.members) await this.store.addMember(id, m.userId, m.role);
      for (const l of c.labels) if (!l.auto) await this.store.addLabel2(id, l.id, false);
      for (const l of await this.store.checklists(c.id))
        await this.store.addChecklist(
          id,
          l.title,
          l.items.map((i) => i.text),
        );
      await this.store.log(id, null, "recurring", { from: c.id });
      made++;
    }
    return made;
  }
}
