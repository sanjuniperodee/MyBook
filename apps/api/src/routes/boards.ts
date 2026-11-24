/**
 * Доски задач в API v1 (приложение CRM): тонкий слой над модулем boards — те же сервисы и права, что у досок на сайте
 * (server/boards-api.ts). Отказ модуля (BoardsError) — ответ с текстом для сотрудника и кодом.
 */
import type { z } from "zod";
import type { CardSummary as CardSummaryOut } from "@mybook/contracts";
import { activityText, BoardsError, boardsErrorStatus, type CardSummary } from "@/modules/boards";
import { staffOptions } from "@/modules/access/ui";
import { apiStaff } from "@/server/api";
import { boardViewer } from "@/server/boards-api";
import { container } from "@/server/container";
import type { Handlers } from "../app";

type Names = "boardsList" | "boardDetail" | "cardCreate" | "cardDetail" | "cardUpdate" | "cardDelete" | "cardMove" | "cardDone" | "cardArchive" | "cardAssignees" | "cardWatch" | "cardLabel" | "cardChecklistCreate" | "checklistItemCreate" | "checklistItemUpdate" | "checklistItemDelete" | "cardCommentCreate" | "cardFileUpload" | "tasksCalendar";

const viewer = async (req: Request) => boardViewer(await apiStaff(req));
const c = () => container().boards;

/** Ошибка модуля досок — ответом (текст для сотрудника), остальное — общий обработчик API. */
async function guard<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    if (BoardsError.is(err)) return Response.json({ error: err.message, code: err.code }, { status: boardsErrorStatus(err.code), headers: { "cache-control": "no-store" } });
    throw err;
  }
}

export const toCard = (s: CardSummary): z.output<typeof CardSummaryOut> => ({
  id: s.id,
  title: s.title,
  kind: s.kind,
  boardId: s.boardId,
  columnId: s.columnId,
  position: s.position,
  priority: s.priority,
  startAt: s.startAt,
  dueAt: s.dueAt,
  doneAt: s.doneAt,
  archived: s.archived,
  coverColor: s.cover && "color" in s.cover ? s.cover.color : null,
  coverImage: s.cover && "image" in s.cover ? s.cover.image : null,
  assigneeIds: s.assigneeIds,
  watcherIds: s.watcherIds,
  labelIds: s.labelIds,
  checklistDone: s.checklist.done,
  checklistTotal: s.checklist.total,
  comments: s.comments,
  attachments: s.attachments,
  hasDescription: s.hasDescription,
  recurring: s.recurring,
  links: s.links,
  editable: s.editable,
});

const columnOut = (x: { id: string; name: string; done: boolean; wipLimit?: number | null }) => ({ id: x.id, name: x.name, done: x.done, wipLimit: x.wipLimit ?? null });

export const boardHandlers: Pick<Handlers, Names> = {
  boardsList: ({ req }) => guard(async () => ({ boards: (await c().boards.list(await viewer(req))).map((b) => ({ id: b.id, name: b.name, description: b.description, kind: b.kind, color: b.color, visibility: b.visibility, isDefault: b.isDefault, canManage: b.canManage, openCards: b.openCards })) })),

  boardDetail: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      const [view, admins] = await Promise.all([c().boards.view(v, input.boardId, { done: input.done === "1" }), container().access.queries.allStaff()]);
      const b = view.board;
      return {
        board: { id: b.id, name: b.name, description: b.description, kind: b.kind, color: b.color, visibility: b.visibility, isDefault: b.isDefault, canManage: b.canManage },
        columns: view.columns.map(columnOut),
        labels: view.labels,
        cards: view.cards.map(toCard),
        staff: staffOptions(admins),
        doneDays: view.doneDays,
      };
    }),

  cardCreate: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      const id = await c().cards.create(v, input.body);
      return { id, card: toCard(await c().cards.summary(v, id)) };
    }),

  cardDetail: ({ req, input }) =>
    guard(async () => {
      const d = await c().cards.detail(await viewer(req), input.cardId);
      const labels = new Map(d.labels.map((l) => [l.id, l.name]));
      return {
        card: toCard(d),
        description: d.description,
        createdById: d.createdById,
        createdAt: d.createdAt,
        remindBeforeMin: d.remindBeforeMin,
        result: d.result,
        estimateMin: d.estimateMin,
        spentMin: d.spentMin,
        board: d.board,
        columns: d.columns.map(columnOut),
        labels: d.labels,
        checklists: d.checklists.map((l) => ({ id: l.id, title: l.title, items: l.items.map((i) => ({ id: i.id, text: i.text, done: i.done, assigneeId: i.assigneeId, dueAt: i.dueAt })) })),
        comments: d.commentList,
        files: d.files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, url: f.url, isImage: f.isImage, createdAt: f.createdAt })),
        activity: d.activity.map((a) => ({ id: a.id, actorId: a.actorId, kind: a.kind, text: activityText(a.kind, a.data, labels), createdAt: a.createdAt })),
      };
    }),

  cardUpdate: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      await c().cards.update(v, input.cardId, input.body);
      return { card: toCard(await c().cards.summary(v, input.cardId)) };
    }),

  cardDelete: ({ req, input }) => guard(async () => (await c().cards.remove(await viewer(req), input.cardId), { ok: true as const })),

  cardMove: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      await c().cards.move(v, input.cardId, input.body);
      return { card: toCard(await c().cards.summary(v, input.cardId)) };
    }),

  cardDone: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      await c().cards.setDone(v, input.cardId, input.body.done, input.body.result);
      return { card: toCard(await c().cards.summary(v, input.cardId)) };
    }),

  cardArchive: ({ req, input }) => guard(async () => (await c().cards.archive(await viewer(req), input.cardId, input.body.archived), { ok: true as const })),

  cardAssignees: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      await c().cards.setAssignees(v, input.cardId, input.body.userIds);
      return { card: toCard(await c().cards.summary(v, input.cardId)) };
    }),

  cardWatch: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      await c().cards.setWatching(v, input.cardId, v.userId, input.body.on);
      return { ok: true as const };
    }),

  cardLabel: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      await c().cards.setLabel(v, input.cardId, input.labelId, input.body.on);
      return { card: toCard(await c().cards.summary(v, input.cardId)) };
    }),

  cardChecklistCreate: ({ req, input }) => guard(async () => ({ id: await c().cards.addChecklist(await viewer(req), input.cardId, input.body.title, input.body.items ?? []) })),
  checklistItemCreate: ({ req, input }) => guard(async () => ({ id: await c().cards.addItem(await viewer(req), input.checklistId, input.body.text) })),
  checklistItemUpdate: ({ req, input }) => guard(async () => (await c().cards.updateItem(await viewer(req), input.itemId, input.body), { ok: true as const })),
  checklistItemDelete: ({ req, input }) => guard(async () => (await c().cards.deleteItem(await viewer(req), input.itemId), { ok: true as const })),
  cardCommentCreate: ({ req, input }) => guard(async () => ({ id: await c().cards.comment(await viewer(req), input.cardId, input.body.text) })),

  cardFileUpload: ({ req, input }) =>
    guard(async () => {
      const v = await viewer(req);
      const file = input.files[0];
      if (!file) throw new BoardsError("invalid", "Выберите файл");
      return { id: await c().cards.attach(v, input.cardId, { name: file.name, type: file.type, data: new Uint8Array(await file.arrayBuffer()) }) };
    }),

  tasksCalendar: ({ req, input }) => guard(async () => ({ cards: (await c().calendar.range(await viewer(req), new Date(input.from), new Date(input.to), { boardId: input.boardId ?? null, mine: input.mine === "1" })).map(toCard) })),
};
