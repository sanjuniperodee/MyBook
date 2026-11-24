import type { BoardColor, TaskPriority, TaskRecurrence } from "@/shared/domain/boards";
import { isBoardColor } from "@/shared/domain/boards";
import type { ActivityRow, AttachmentRow, BoardRow, CardRow, ChecklistRow, ColumnRow, CommentRow, LabelRow, RuleRow, TaskKind } from "./ports";

/** К чему карточка: сделка, заказ, клиент, книга, чат — кликабельная ссылка. */
export interface CardLink {
  type: "deal" | "order" | "client" | "book" | "chat";
  id: string;
  label: string;
  href: string;
}

/** Карточка на доске, в списке, календаре и шкале (даты — ISO). */
export interface CardSummary {
  id: string;
  title: string;
  kind: TaskKind;
  boardId: string | null;
  columnId: string | null;
  position: number | null;
  priority: TaskPriority | null;
  startAt: string | null;
  dueAt: string | null;
  doneAt: string | null;
  archived: boolean;
  /** Цвет обложки (токен) или адрес картинки-вложения. */
  cover: { color: BoardColor } | { image: string } | null;
  /** Исполнители: главный первым. */
  assigneeIds: string[];
  watcherIds: string[];
  labelIds: string[];
  checklist: { done: number; total: number };
  comments: number;
  attachments: number;
  hasDescription: boolean;
  recurring: boolean;
  estimateMin: number | null;
  spentMin: number | null;
  links: CardLink[];
  /** Подпись первой связи — для поиска и строки списка. */
  linkLabel: string | null;
  fromBot: boolean;
  editable: boolean;
}

export interface BoardSummary {
  id: string;
  name: string;
  description: string | null;
  kind: BoardRow["kind"];
  department: string | null;
  color: string;
  visibility: "all" | "members";
  isDefault: boolean;
  ownerId: string | null;
  canManage: boolean;
  openCards?: number;
}

export interface BoardView {
  board: BoardSummary;
  columns: { id: string; name: string; position: number; done: boolean; wipLimit: number | null; color: string | null }[];
  labels: { id: string; name: string; color: string }[];
  members: { userId: string; role: "admin" | "member" }[];
  rules: { id: string; name: string; trigger: RuleRow["trigger"]; actions: RuleRow["actions"]; enabled: boolean; runs: number; lastRunAt: string | null }[];
  cards: CardSummary[];
  /** Выполненные показаны за столько дней (остальные — в архиве и в поиске «Задач»). */
  doneDays: number;
}

export interface CardDetail extends CardSummary {
  description: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  remindBeforeMin: number | null;
  result: string;
  recurrence: TaskRecurrence | null;
  meet: boolean;
  /** Ссылка Google Meet (создаёт Google Календарь исполнителя). */
  meetUrl: string | null;
  board: { id: string; name: string } | null;
  columns: { id: string; name: string; done: boolean }[];
  labels: { id: string; name: string; color: string }[];
  checklists: { id: string; title: string; items: { id: string; text: string; done: boolean; doneById: string | null; assigneeId: string | null; dueAt: string | null }[] }[];
  commentList: { id: string; authorId: string | null; text: string; createdAt: string; editedAt: string | null; mine: boolean }[];
  files: { id: string; name: string; mime: string; size: number; url: string; uploadedById: string | null; createdAt: string; isImage: boolean }[];
  activity: { id: string; actorId: string | null; kind: string; data: Record<string, unknown>; createdAt: string }[];
  dealId: string | null;
  orderId: string | null;
  clientId: string | null;
  bookId: string | null;
  conversationId: string | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const fileUrl = (taskId: string, id: string) => `/api/admin/tasks/${taskId}/files/${id}`;

export function cardLinks(c: CardRow): CardLink[] {
  const out: CardLink[] = [];
  if (c.dealId) out.push({ type: "deal", id: c.dealId, label: `${c.dealNumber ? `Д${c.dealNumber}` : "Сделка"} · ${c.dealContact || c.dealTitle || "без имени"}`, href: `/admin/deals/${c.dealId}` });
  if (c.orderId) out.push({ type: "order", id: c.orderId, label: `Заказ №${c.orderNumber ?? "—"}`, href: `/admin/orders/${c.orderId}` });
  if (c.clientId && !c.dealId) out.push({ type: "client", id: c.clientId, label: c.clientName || "Клиент", href: `/admin/clients/${c.clientId}` });
  if (c.bookId) out.push({ type: "book", id: c.bookId, label: `Книга «${c.bookTitle || "без названия"}»`, href: `/books/${c.bookId}/preview` });
  if (c.conversationId) out.push({ type: "chat", id: c.conversationId, label: `Чат · ${c.chatName || "клиент"}`, href: `/admin/chats?c=${c.conversationId}` });
  return out;
}

export function cardSummary(c: CardRow, columnId: string | null, editable: boolean): CardSummary {
  const links = cardLinks(c);
  const cover = c.cover?.startsWith("att:") ? { image: fileUrl(c.id, c.cover.slice(4)) } : isBoardColor(c.cover) ? { color: c.cover } : null;
  return {
    id: c.id,
    title: c.title.replace(/\s*\(бот\)\s*$/, ""),
    kind: c.kind,
    boardId: c.boardId,
    columnId,
    position: c.position,
    priority: c.priority,
    startAt: iso(c.startAt),
    dueAt: iso(c.dueAt),
    doneAt: iso(c.doneAt),
    archived: !!c.archivedAt,
    cover,
    assigneeIds: [...(c.assigneeId ? [c.assigneeId] : []), ...c.members.filter((m) => m.role === "assignee" && m.userId !== c.assigneeId).map((m) => m.userId)],
    watcherIds: c.members.filter((m) => m.role === "watcher").map((m) => m.userId),
    labelIds: c.labels.map((l) => l.id),
    checklist: { done: c.checklistDone, total: c.checklistTotal },
    comments: c.comments,
    attachments: c.attachments,
    hasDescription: !!c.description?.trim(),
    recurring: !!c.recurrence,
    estimateMin: c.estimateMin,
    spentMin: c.spentMin,
    links,
    linkLabel: links[0]?.label ?? null,
    fromBot: /\(бот\)\s*$/.test(c.title),
    editable,
  };
}

export function boardSummary(b: BoardRow, canManage: boolean, openCards?: number): BoardSummary {
  return { id: b.id, name: b.name, description: b.description, kind: b.kind, department: b.department, color: b.color, visibility: b.visibility, isDefault: b.isDefault, ownerId: b.ownerId, canManage, ...(openCards === undefined ? {} : { openCards }) };
}

export const columnView = (c: ColumnRow) => ({ id: c.id, name: c.name, position: c.position, done: c.done, wipLimit: c.wipLimit, color: c.color });
export const labelView = (l: LabelRow) => ({ id: l.id, name: l.name, color: l.color });
export const ruleView = (r: RuleRow) => ({ id: r.id, name: r.name, trigger: r.trigger, actions: r.actions, enabled: r.enabled, runs: r.runs, lastRunAt: iso(r.lastRunAt) });

export function cardDetail(
  c: CardRow,
  summary: CardSummary,
  extra: { meetUrl?: string | null; board: { id: string; name: string } | null; columns: ColumnRow[]; labels: LabelRow[]; checklists: ChecklistRow[]; comments: CommentRow[]; files: AttachmentRow[]; activity: ActivityRow[]; me: string },
): CardDetail {
  return {
    ...summary,
    description: c.description ?? "",
    createdById: c.createdById,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    remindBeforeMin: c.remindBeforeMin,
    result: c.result ?? "",
    recurrence: c.recurrence,
    meet: c.meet,
    meetUrl: extra.meetUrl ?? null,
    board: extra.board,
    columns: extra.columns.map((x) => ({ id: x.id, name: x.name, done: x.done })),
    labels: extra.labels.map(labelView),
    checklists: extra.checklists.map((l) => ({ id: l.id, title: l.title, items: l.items.map((i) => ({ id: i.id, text: i.text, done: !!i.doneAt, doneById: i.doneById, assigneeId: i.assigneeId, dueAt: iso(i.dueAt) })) })),
    commentList: extra.comments.map((m) => ({ id: m.id, authorId: m.authorId, text: m.text, createdAt: m.createdAt.toISOString(), editedAt: iso(m.editedAt), mine: m.authorId === extra.me })),
    files: extra.files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, url: fileUrl(c.id, f.id), uploadedById: f.uploadedById, createdAt: f.createdAt.toISOString(), isImage: /^image\/(png|jpe?g|webp|gif|avif)$/.test(f.mime) })),
    activity: extra.activity.map((a) => ({ id: a.id, actorId: a.actorId, kind: a.kind, data: a.data, createdAt: a.createdAt.toISOString() })),
    dealId: c.dealId,
    orderId: c.orderId,
    clientId: c.clientId,
    bookId: c.bookId,
    conversationId: c.conversationId,
  };
}
