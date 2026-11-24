/**
 * API v1 — доски задач (приложение CRM): доски, карточки (задачи CRM), чек-листы, комментарии, вложения, календарь.
 * Права — как у досок на сайте (модуль boards): общую доску видят все сотрудники, закрытую — участники; карточку о
 * клиенте роль «только свои» видит свою и ничью. Отказ — 400/403/404 с текстом для сотрудника в `error` и кодом
 * (`invalid`, `forbidden`, `notFound`, `tooLarge`). Даты — ISO 8601; «Готово» — колонка с done=true.
 */
import { z } from "zod";
import { iso, Ok, route, schemas, uuid, type RouteDef } from "./core";

const priority = z.enum(["urgent", "high", "normal", "low"]);
const kind = z.enum(["task", "call", "message", "meeting"]);

export const StaffRef = z.object({ id: uuid, label: z.string() }).register(schemas, { id: "StaffRef" });

export const BoardInfo = z
  .object({
    id: uuid,
    name: z.string(),
    description: z.string().nullable(),
    /** team — доска отдела, personal — личная, project — проект. */
    kind: z.enum(["team", "personal", "project"]),
    /** Цвет-токен: wine, danger, warning, success, info, violet, teal, slate. */
    color: z.string(),
    visibility: z.enum(["all", "members"]),
    /** Доска по умолчанию: на ней задачи из сделок, правил и бота. */
    isDefault: z.boolean(),
    /** Можно менять колонки, метки, участников. */
    canManage: z.boolean(),
    openCards: z.number().int().optional(),
  })
  .register(schemas, { id: "BoardInfo" });

export const BoardList = z.object({ boards: z.array(BoardInfo) }).register(schemas, { id: "BoardList" });

export const BoardColumn = z.object({ id: uuid, name: z.string(), done: z.boolean(), wipLimit: z.number().int().nullable() }).register(schemas, { id: "BoardColumn" });
export const BoardLabel = z.object({ id: uuid, name: z.string(), color: z.string() }).register(schemas, { id: "BoardLabel" });

export const CardLink = z
  .object({
    type: z.enum(["deal", "order", "client", "book", "chat"]),
    id: uuid,
    label: z.string(),
    /** Путь в CRM сайта (/admin/deals/…). */
    href: z.string(),
  })
  .register(schemas, { id: "CardLink" });

export const CardSummary = z
  .object({
    id: uuid,
    title: z.string(),
    kind,
    boardId: uuid.nullable(),
    columnId: uuid.nullable(),
    position: z.number().nullable(),
    priority: priority.nullable(),
    startAt: iso.nullable(),
    dueAt: iso.nullable(),
    doneAt: iso.nullable(),
    archived: z.boolean(),
    /** Цвет обложки (токен) или null. */
    coverColor: z.string().nullable(),
    /** Картинка обложки (путь к вложению) или null. */
    coverImage: z.string().nullable(),
    /** Исполнители, главный первым. */
    assigneeIds: z.array(uuid),
    watcherIds: z.array(uuid),
    labelIds: z.array(uuid),
    checklistDone: z.number().int(),
    checklistTotal: z.number().int(),
    comments: z.number().int(),
    attachments: z.number().int(),
    hasDescription: z.boolean(),
    recurring: z.boolean(),
    links: z.array(CardLink),
    editable: z.boolean(),
  })
  .register(schemas, { id: "CardSummary" });

export const BoardDetail = z
  .object({
    board: BoardInfo,
    columns: z.array(BoardColumn),
    labels: z.array(BoardLabel),
    cards: z.array(CardSummary),
    /** Сотрудники — для исполнителей и подписей. */
    staff: z.array(StaffRef),
    /** Выполненные показаны за столько дней. */
    doneDays: z.number().int(),
  })
  .register(schemas, { id: "BoardDetail" });

export const ChecklistItem = z.object({ id: uuid, text: z.string(), done: z.boolean(), assigneeId: uuid.nullable(), dueAt: iso.nullable() }).register(schemas, { id: "ChecklistItem" });
export const Checklist = z.object({ id: uuid, title: z.string(), items: z.array(ChecklistItem) }).register(schemas, { id: "Checklist" });
export const CardComment = z.object({ id: uuid, authorId: uuid.nullable(), text: z.string(), createdAt: iso, editedAt: iso.nullable(), mine: z.boolean() }).register(schemas, { id: "CardComment" });
export const CardFile = z.object({ id: uuid, name: z.string(), mime: z.string(), size: z.number().int(), url: z.string(), isImage: z.boolean(), createdAt: iso }).register(schemas, { id: "CardFile" });
export const CardActivity = z.object({ id: uuid, actorId: uuid.nullable(), kind: z.string(), text: z.string(), createdAt: iso }).register(schemas, { id: "CardActivity" });

export const CardDetail = z
  .object({
    card: CardSummary,
    description: z.string(),
    createdById: uuid.nullable(),
    createdAt: iso,
    remindBeforeMin: z.number().int().nullable(),
    result: z.string(),
    estimateMin: z.number().int().nullable(),
    spentMin: z.number().int().nullable(),
    board: z.object({ id: uuid, name: z.string() }).nullable(),
    columns: z.array(BoardColumn),
    labels: z.array(BoardLabel),
    checklists: z.array(Checklist),
    comments: z.array(CardComment),
    files: z.array(CardFile),
    activity: z.array(CardActivity),
  })
  .register(schemas, { id: "CardDetail" });

export const CardCreate = z
  .object({
    /** Без доски — доска по умолчанию; без колонки — первая. */
    boardId: uuid.nullable().optional(),
    columnId: uuid.nullable().optional(),
    title: z.string().trim().min(1).max(200),
    kind: kind.optional(),
    description: z.string().max(20_000).nullable().optional(),
    dueAt: iso.nullable().optional(),
    startAt: iso.nullable().optional(),
    priority: priority.nullable().optional(),
    assigneeIds: z.array(uuid).max(20).optional(),
    labelIds: z.array(uuid).max(20).optional(),
    dealId: uuid.nullable().optional(),
    clientId: uuid.nullable().optional(),
    orderId: uuid.nullable().optional(),
  })
  .register(schemas, { id: "CardCreate" });

export const CardPatch = z
  .object({
    title: z.string().trim().min(1).max(200),
    kind,
    description: z.string().max(20_000).nullable(),
    priority: priority.nullable(),
    startAt: iso.nullable(),
    dueAt: iso.nullable(),
    remindBeforeMin: z.number().int().min(0).max(10_080).nullable(),
    result: z.string().max(500).nullable(),
    estimateMin: z.number().int().min(0).max(100_000).nullable(),
    spentMin: z.number().int().min(0).max(100_000).nullable(),
  })
  .partial()
  .strict()
  .register(schemas, { id: "CardPatch" });

export const CardResult = z.object({ card: CardSummary }).register(schemas, { id: "CardResult" });
export const CardCreated = z.object({ id: uuid, card: CardSummary }).register(schemas, { id: "CardCreated" });
export const CreatedId = z.object({ id: uuid }).register(schemas, { id: "CreatedId" });
export const CardMove = z.object({ boardId: uuid.nullable().optional(), columnId: uuid, beforeId: uuid.nullable().optional(), afterId: uuid.nullable().optional() }).register(schemas, { id: "CardMove" });
export const CardDone = z.object({ done: z.boolean(), result: z.string().max(500).nullable().optional() }).register(schemas, { id: "CardDone" });
export const CardArchive = z.object({ archived: z.boolean() }).register(schemas, { id: "CardArchive" });
export const CardAssignees = z.object({ userIds: z.array(uuid).max(20) }).register(schemas, { id: "CardAssignees" });
export const CardWatch = z.object({ on: z.boolean() }).register(schemas, { id: "CardWatch" });
export const CardLabelToggle = z.object({ on: z.boolean() }).register(schemas, { id: "CardLabelToggle" });
export const ChecklistCreate = z.object({ title: z.string().trim().min(1).max(120), items: z.array(z.string().max(300)).max(50).optional() }).register(schemas, { id: "ChecklistCreate" });
export const ChecklistItemCreate = z.object({ text: z.string().trim().min(1).max(300) }).register(schemas, { id: "ChecklistItemCreate" });
export const ChecklistItemPatch = z.object({ text: z.string().trim().min(1).max(300), done: z.boolean(), assigneeId: uuid.nullable(), dueAt: iso.nullable() }).partial().strict().register(schemas, { id: "ChecklistItemPatch" });
export const CommentCreate = z.object({ text: z.string().trim().min(1).max(5000) }).register(schemas, { id: "CommentCreate" });
export const CardList = z.object({ cards: z.array(CardSummary) }).register(schemas, { id: "CardList" });

const BoardParams = z.object({ boardId: uuid });
const CardParams = z.object({ cardId: uuid });

export const boardsRoutes = {
  boardsList: route({ method: "GET", path: "/api/v1/boards", auth: "staff", tag: "boards", summary: "Доски, которые видит сотрудник (с числом открытых карточек)", response: BoardList }),
  boardDetail: route({ method: "GET", path: "/api/v1/boards/{boardId}", auth: "staff", tag: "boards", summary: "Доска: колонки, метки, видимые карточки, сотрудники (done=1 — выполненные за 90 дней)", params: BoardParams, query: z.object({ done: z.enum(["1"]).optional() }), response: BoardDetail }),
  cardCreate: route({ method: "POST", path: "/api/v1/cards", auth: "staff", tag: "boards", summary: "Новая карточка (задача CRM) на доске", body: CardCreate, response: CardCreated }),
  cardDetail: route({ method: "GET", path: "/api/v1/cards/{cardId}", auth: "staff", tag: "boards", summary: "Карточка целиком: чек-листы, комментарии, вложения, журнал", params: CardParams, response: CardDetail }),
  cardUpdate: route({ method: "PATCH", path: "/api/v1/cards/{cardId}", auth: "staff", tag: "boards", summary: "Правка карточки (только переданные поля)", params: CardParams, body: CardPatch, response: CardResult }),
  cardDelete: route({ method: "DELETE", path: "/api/v1/cards/{cardId}", auth: "staff", tag: "boards", summary: "Удалить насовсем (автор или админ доски; остальным — в архив)", params: CardParams, response: Ok }),
  cardMove: route({ method: "POST", path: "/api/v1/cards/{cardId}/move", auth: "staff", tag: "boards", summary: "Перенос в колонку между соседями (в «Готово» — выполнена)", params: CardParams, body: CardMove, response: CardResult }),
  cardDone: route({ method: "POST", path: "/api/v1/cards/{cardId}/done", auth: "staff", tag: "boards", summary: "Выполнить или вернуть в работу (с итогом)", params: CardParams, body: CardDone, response: CardResult }),
  cardArchive: route({ method: "POST", path: "/api/v1/cards/{cardId}/archive", auth: "staff", tag: "boards", summary: "В архив и обратно", params: CardParams, body: CardArchive, response: Ok }),
  cardAssignees: route({ method: "PUT", path: "/api/v1/cards/{cardId}/assignees", auth: "staff", tag: "boards", summary: "Исполнители (первый — главный: напоминания, «Мой день»)", params: CardParams, body: CardAssignees, response: CardResult }),
  cardWatch: route({ method: "PUT", path: "/api/v1/cards/{cardId}/watch", auth: "staff", tag: "boards", summary: "Следить за карточкой или нет", params: CardParams, body: CardWatch, response: Ok }),
  cardLabel: route({ method: "PUT", path: "/api/v1/cards/{cardId}/labels/{labelId}", auth: "staff", tag: "boards", summary: "Метка на карточке — поставить или снять", params: z.object({ cardId: uuid, labelId: uuid }), body: CardLabelToggle, response: CardResult }),
  cardChecklistCreate: route({ method: "POST", path: "/api/v1/cards/{cardId}/checklists", auth: "staff", tag: "boards", summary: "Новый чек-лист с пунктами", params: CardParams, body: ChecklistCreate, response: CreatedId }),
  checklistItemCreate: route({ method: "POST", path: "/api/v1/checklists/{checklistId}/items", auth: "staff", tag: "boards", summary: "Пункт чек-листа", params: z.object({ checklistId: uuid }), body: ChecklistItemCreate, response: CreatedId }),
  checklistItemUpdate: route({ method: "PATCH", path: "/api/v1/checklist-items/{itemId}", auth: "staff", tag: "boards", summary: "Пункт: текст, отметка, исполнитель, срок", params: z.object({ itemId: uuid }), body: ChecklistItemPatch, response: Ok }),
  checklistItemDelete: route({ method: "DELETE", path: "/api/v1/checklist-items/{itemId}", auth: "staff", tag: "boards", summary: "Удалить пункт", params: z.object({ itemId: uuid }), response: Ok }),
  cardCommentCreate: route({ method: "POST", path: "/api/v1/cards/{cardId}/comments", auth: "staff", tag: "boards", summary: "Комментарий (@Имя — уведомить коллегу)", params: CardParams, body: CommentCreate, response: CreatedId }),
  cardFileUpload: route({ method: "POST", path: "/api/v1/cards/{cardId}/files", auth: "staff", tag: "boards", summary: "Вложение (multipart, поле file, до 25 МБ); первая картинка — обложка", params: CardParams, files: { field: "file" }, response: CreatedId }),
  tasksCalendar: route({
    method: "GET",
    path: "/api/v1/tasks/calendar",
    auth: "staff",
    tag: "boards",
    summary: "Карточки со сроком или началом в периоде (до 120 дней): со всех видимых досок или одной; mine=1 — только мои",
    query: z.object({ from: iso, to: iso, boardId: uuid.optional(), mine: z.enum(["1"]).optional() }),
    response: CardList,
  }),
} as const satisfies Record<string, RouteDef>;
