import type { BoardColor, BoardKind, BoardRuleAction, BoardRuleTrigger, TaskPriority, TaskRecurrence } from "@/shared/domain/boards";

export type TaskKind = "task" | "call" | "message" | "meeting";

export interface BoardRow {
  id: string;
  name: string;
  description: string | null;
  kind: BoardKind;
  department: string | null;
  color: string;
  ownerId: string | null;
  visibility: "all" | "members";
  isDefault: boolean;
  templateKey: string | null;
  position: number;
  archivedAt: Date | null;
  /** Роль зрителя в участниках (если запрошено для зрителя). */
  memberRole: "admin" | "member" | null;
}

export interface ColumnRow {
  id: string;
  boardId: string;
  name: string;
  position: number;
  done: boolean;
  wipLimit: number | null;
  color: string | null;
}

export interface LabelRow {
  id: string;
  boardId: string | null;
  name: string;
  color: string;
  position: number;
}

export interface RuleRow {
  id: string;
  boardId: string;
  name: string;
  trigger: BoardRuleTrigger;
  actions: BoardRuleAction[];
  enabled: boolean;
  position: number;
  runs: number;
  lastRunAt: Date | null;
}

/** Карточка (строка crm_tasks) с тем, к чему она привязана, и счётчиками для доски. */
export interface CardRow {
  id: string;
  title: string;
  kind: TaskKind;
  boardId: string | null;
  columnId: string | null;
  position: number | null;
  description: string | null;
  priority: TaskPriority | null;
  startAt: Date | null;
  dueAt: Date | null;
  doneAt: Date | null;
  archivedAt: Date | null;
  cover: string | null;
  assigneeId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  remindBeforeMin: number | null;
  result: string | null;
  estimateMin: number | null;
  spentMin: number | null;
  recurrence: TaskRecurrence | null;
  meet: boolean;
  dealId: string | null;
  orderId: string | null;
  clientId: string | null;
  bookId: string | null;
  conversationId: string | null;
  dealNumber: number | null;
  dealTitle: string | null;
  dealContact: string | null;
  orderNumber: number | null;
  clientName: string | null;
  bookTitle: string | null;
  chatName: string | null;
  /** Соисполнители и наблюдатели. */
  members: { userId: string; role: "assignee" | "watcher" }[];
  labels: { id: string; auto: boolean }[];
  checklistDone: number;
  checklistTotal: number;
  comments: number;
  attachments: number;
}

export interface NewCard {
  title: string;
  kind: TaskKind;
  boardId: string | null;
  columnId: string | null;
  position: number | null;
  description?: string | null;
  priority?: TaskPriority | null;
  startAt?: Date | null;
  dueAt: Date | null;
  remindBeforeMin: number | null;
  assigneeId: string | null;
  createdById: string | null;
  dealId?: string | null;
  orderId?: string | null;
  clientId?: string | null;
  bookId?: string | null;
  conversationId?: string | null;
  recurrence?: TaskRecurrence | null;
  estimateMin?: number | null;
  doneAt?: Date | null;
  cover?: string | null;
  meet?: boolean;
}

export type CardPatch = Partial<{
  title: string;
  kind: TaskKind;
  boardId: string | null;
  columnId: string | null;
  position: number | null;
  description: string | null;
  priority: TaskPriority | null;
  startAt: Date | null;
  dueAt: Date | null;
  doneAt: Date | null;
  doneById: string | null;
  archivedAt: Date | null;
  cover: string | null;
  assigneeId: string | null;
  remindBeforeMin: number | null;
  remindedAt: Date | null;
  overdueNotifiedAt: Date | null;
  result: string | null;
  estimateMin: number | null;
  spentMin: number | null;
  recurrence: TaskRecurrence | null;
  recurSpawnedAt: Date | null;
  meet: boolean;
  dealId: string | null;
  orderId: string | null;
  clientId: string | null;
  bookId: string | null;
  conversationId: string | null;
}>;

export interface ChecklistRow {
  id: string;
  taskId: string;
  title: string;
  position: number;
  items: { id: string; text: string; position: number; doneAt: Date | null; doneById: string | null; assigneeId: string | null; dueAt: Date | null }[];
}

export interface CommentRow {
  id: string;
  taskId: string;
  authorId: string | null;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
}

export interface AttachmentRow {
  id: string;
  taskId: string;
  storageKey: string;
  name: string;
  mime: string;
  size: number;
  uploadedById: string | null;
  createdAt: Date;
}

export interface ActivityRow {
  id: string;
  taskId: string;
  actorId: string | null;
  kind: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface ViewRow {
  id: string;
  userId: string;
  boardId: string | null;
  name: string;
  query: string;
  shared: boolean;
}

/** Хранилище досок (реализация — infrastructure/store.ts, Drizzle). */
export interface BoardsStore {
  boards(userId: string, opts?: { archived?: boolean }): Promise<(BoardRow & { openCards: number })[]>;
  board(id: string, userId: string): Promise<BoardRow | null>;
  defaultBoard(): Promise<BoardRow | null>;
  createBoard(b: { name: string; description: string | null; kind: BoardKind; department: string | null; color: BoardColor; ownerId: string; visibility: "all" | "members"; templateKey: string | null }): Promise<string>;
  updateBoard(id: string, patch: Partial<{ name: string; description: string | null; color: string; visibility: "all" | "members"; archivedAt: Date | null; position: number }>): Promise<void>;
  columns(boardId: string): Promise<ColumnRow[]>;
  column(id: string): Promise<ColumnRow | null>;
  addColumn(c: { boardId: string; name: string; position: number; done: boolean; wipLimit: number | null }): Promise<string>;
  updateColumn(id: string, patch: Partial<{ name: string; position: number; done: boolean; wipLimit: number | null; color: string | null }>): Promise<void>;
  /** Удалить колонку: её карточки — в колонку to. */
  deleteColumn(id: string, to: string | null): Promise<void>;
  labels(boardId: string): Promise<LabelRow[]>;
  addLabel(l: { boardId: string; name: string; color: string; position: number }): Promise<string>;
  updateLabel(id: string, patch: Partial<{ name: string; color: string }>): Promise<void>;
  deleteLabel(id: string): Promise<void>;
  members(boardId: string): Promise<{ userId: string; role: "admin" | "member" }[]>;
  setBoardMember(boardId: string, userId: string, role: "admin" | "member"): Promise<void>;
  removeBoardMember(boardId: string, userId: string): Promise<void>;
  rules(boardId: string): Promise<RuleRow[]>;
  rule(id: string): Promise<RuleRow | null>;
  addRule(r: { boardId: string; name: string; trigger: BoardRuleTrigger; actions: BoardRuleAction[]; position: number; createdById: string | null; enabled?: boolean }): Promise<string>;
  updateRule(id: string, patch: Partial<{ name: string; trigger: BoardRuleTrigger; actions: BoardRuleAction[]; enabled: boolean }>): Promise<void>;
  deleteRule(id: string): Promise<void>;
  ruleFired(id: string, at: Date): Promise<void>;
  /** Отметить срабатывание по времени (правило + карточка + ключ); false — уже было. */
  claimRuleRun(ruleId: string, taskId: string, key: string): Promise<boolean>;

  /** Карточки доски (на доске по умолчанию — и задачи без доски): открытые и выполненные после doneSince. */
  cards(boardId: string, isDefault: boolean, opts: { doneSince: Date | null; archived?: boolean }): Promise<CardRow[]>;
  card(id: string): Promise<CardRow | null>;
  /** Карточки со сроком или началом в периоде на досках из boardIds (null — на всех) — для календаря и шкалы. */
  cardsInRange(from: Date, to: Date, opts: { boardIds: string[] | null; includeDefaultNull: boolean; userId?: string | null }): Promise<CardRow[]>;
  insertCard(c: NewCard): Promise<string>;
  updateCard(id: string, patch: CardPatch): Promise<void>;
  /** Обновить updated_at (живое обновление и календари после правки чек-листа, метки, комментария). */
  touch(id: string): Promise<void>;
  deleteCard(id: string): Promise<void>;
  /** Соседние позиции в колонке — для вставки между before и after. */
  columnPositions(boardId: string, isDefault: boolean, columnId: string): Promise<{ id: string; position: number | null }[]>;
  renumber(ids: string[]): Promise<void>;
  setMembers(taskId: string, role: "assignee" | "watcher", userIds: string[]): Promise<void>;
  addMember(taskId: string, userId: string, role: "assignee" | "watcher"): Promise<void>;
  removeMember(taskId: string, userId: string, role: "assignee" | "watcher"): Promise<void>;
  addLabel2(taskId: string, labelId: string, auto: boolean): Promise<boolean>;
  removeLabel2(taskId: string, labelId: string): Promise<boolean>;
  removeAutoLabels(taskId: string): Promise<number>;
  checklists(taskId: string): Promise<ChecklistRow[]>;
  addChecklist(taskId: string, title: string, items: string[]): Promise<string>;
  renameChecklist(id: string, title: string): Promise<void>;
  deleteChecklist(id: string): Promise<void>;
  checklistOf(id: string): Promise<{ id: string; taskId: string } | null>;
  itemOf(id: string): Promise<{ id: string; checklistId: string; taskId: string; doneAt: Date | null; text: string } | null>;
  addItem(checklistId: string, text: string): Promise<string>;
  updateItem(id: string, patch: Partial<{ text: string; doneAt: Date | null; doneById: string | null; assigneeId: string | null; dueAt: Date | null; position: number }>): Promise<void>;
  deleteItem(id: string): Promise<void>;
  comments(taskId: string): Promise<CommentRow[]>;
  comment(id: string): Promise<CommentRow | null>;
  addComment(taskId: string, authorId: string, text: string): Promise<string>;
  editComment(id: string, text: string, at: Date): Promise<void>;
  deleteComment(id: string): Promise<void>;
  attachments(taskId: string): Promise<AttachmentRow[]>;
  attachment(id: string): Promise<AttachmentRow | null>;
  addAttachment(a: Omit<AttachmentRow, "createdAt">): Promise<void>;
  deleteAttachment(id: string): Promise<void>;
  activity(taskId: string, limit: number): Promise<ActivityRow[]>;
  log(taskId: string, actorId: string | null, kind: string, data?: Record<string, unknown>): Promise<void>;
  views(userId: string, boardId: string | null): Promise<ViewRow[]>;
  addView(v: Omit<ViewRow, "id">): Promise<string>;
  view(id: string): Promise<ViewRow | null>;
  deleteView(id: string): Promise<void>;

  /** Открытые карточки со сроком, прошедшим после since, на досках с правилами «срок прошёл». */
  overdueCards(now: Date, limit: number): Promise<{ taskId: string; boardId: string; dueAt: Date }[]>;
  /** Выполненные карточки с повтором, у которых следующая ещё не создана. */
  recurringDone(limit: number): Promise<CardRow[]>;
  /** Карточки с меткой «просрочено» (auto), у которых срок уже не прошёл или они выполнены. */
  resolvedAutoLabels(now: Date, limit: number): Promise<string[]>;
  staffName(id: string): Promise<string | null>;
  activeStaff(ids: string[]): Promise<string[]>;
}

export interface BoardsLive {
  /** Изменилась доска (колонки, метки, правила): открытые экраны перечитывают её. Карточки сообщает триггер БД. */
  boardChanged(boardId: string): Promise<void>;
}

/** Уведомления сотрудникам (порт рабочего пространства): одно на карточку, пока не прочитано. */
export interface BoardsNotifier {
  notify(userIds: (string | null | undefined)[], n: { kind: "task" | "mention" | "reminder"; title: string; body?: string; link: string }): Promise<void>;
  /** Упоминания @Имя в тексте: каждому упомянутому — одно уведомление. */
  mentions(text: string, authorId: string, authorName: string, link: string, where: string): Promise<string[]>;
}

export interface BoardsFiles {
  put(key: string, data: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
}
