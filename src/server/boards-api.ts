import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { BoardsError, boardsErrorStatus, type BoardViewer } from "@/modules/boards";
import { can, type Staff } from "@/server/access";
import { apiStaff, HttpError } from "@/server/api";
import { container } from "@/server/container";

/**
 * JSON API досок для веба CRM (/api/admin/boards/…): тонкий слой над модулем boards — разбор входа, права сотрудника,
 * ответы. Мобильное приложение ходит в те же сервисы через API v1 (apps/api/src/routes/boards.ts).
 */

export function boardViewer(staff: Staff): BoardViewer {
  return { userId: staff.user.id, name: staff.user.name || staff.user.email, seesAll: staff.scope === "all", allTasks: can(staff, "tasks.all"), manageBoards: can(staff, "boards.manage") };
}

const id = z.string().uuid();
const optId = id.nullable().optional();
const isoish = z.string().max(40).nullable().optional();
const priority = z.enum(["urgent", "high", "normal", "low"]).nullable().optional();
const kind = z.enum(["task", "call", "message", "meeting"]).optional();
const recurrence = z.object({ freq: z.enum(["daily", "weekdays", "weekly", "monthly"]), interval: z.number().int().min(1).max(365), until: z.string().max(10).nullable().optional() }).nullable().optional();

const cardCreate = z.object({
  boardId: optId,
  columnId: optId,
  title: z.string().max(500),
  kind,
  description: z.string().max(20_000).nullable().optional(),
  dueAt: isoish,
  startAt: isoish,
  priority,
  assigneeIds: z.array(id).max(20).optional(),
  labelIds: z.array(id).max(20).optional(),
  at: z.enum(["top", "bottom"]).optional(),
  dealId: optId,
  orderId: optId,
  clientId: optId,
  bookId: optId,
  conversationId: optId,
});

const cardUpdate = z.object({
  title: z.string().max(500).optional(),
  kind,
  description: z.string().max(20_000).nullable().optional(),
  priority,
  startAt: isoish,
  dueAt: isoish,
  remindBeforeMin: z.number().int().min(0).max(10_080).nullable().optional(),
  cover: z.string().max(60).nullable().optional(),
  estimateMin: z.number().min(0).max(100_000).nullable().optional(),
  spentMin: z.number().min(0).max(100_000).nullable().optional(),
  recurrence,
  result: z.string().max(500).nullable().optional(),
  meet: z.boolean().optional(),
  dealId: optId,
  orderId: optId,
  clientId: optId,
  bookId: optId,
  conversationId: optId,
});

const bulk = z.object({
  ids: z.array(id).min(1).max(200),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("move"), columnId: id }),
    z.object({ type: z.literal("assign"), userId: id.nullable() }),
    z.object({ type: z.literal("label"), labelId: id, on: z.boolean() }),
    z.object({ type: z.literal("done"), done: z.boolean() }),
    z.object({ type: z.literal("archive"), archived: z.boolean() }),
    z.object({ type: z.literal("due"), dueAt: z.string().max(40).nullable() }),
    z.object({ type: z.literal("priority"), priority: z.enum(["urgent", "high", "normal", "low"]).nullable() }),
  ]),
});

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
const body = async <T extends z.ZodType>(req: Request, schema: T): Promise<z.output<T>> => schema.parse(await req.json().catch(() => ({})));

/** Обработчик /api/admin/boards/[...path]: путь без префикса, метод — из запроса. */
export async function boardsApi(req: Request, path: string[]): Promise<Response> {
  try {
    const staff = await apiStaff(req);
    const v = boardViewer(staff);
    const m = req.method;
    const c = container().boards;
    const [a, b, d, e] = path;
    const url = new URL(req.url);

    // ─── Доски ───
    if (!a) {
      if (m === "GET") return json({ boards: await c.boards.list(v, { archived: url.searchParams.get("archived") === "1" }), templates: c.boards.templates() });
      if (m === "POST") {
        const input = await body(req, z.object({ name: z.string().max(200), template: z.string().max(40).nullable().optional(), from: optId, kind: z.enum(["team", "personal", "project"]).optional(), visibility: z.enum(["all", "members"]).optional(), description: z.string().max(500).nullable().optional(), color: z.string().max(20).nullable().optional() }));
        return json({ id: await c.boards.create(v, input) }, 201);
      }
    }
    if (a === "reorder" && m === "POST") {
      await c.boards.reorderBoards(v, (await body(req, z.object({ ids: z.array(id).max(200) }))).ids);
      return json({ ok: true });
    }
    if (a === "calendar") {
      if (b === "google") {
        if (m === "GET") return json(await c.google.status(v));
        if (m === "DELETE") return (await c.google.disconnect(v), json({ ok: true }));
        if (m === "POST") return json({ changes: await c.google.syncOne(v.userId) });
      }
      if (b === "feed") {
        if (m === "GET") return json(await c.calendar.feedStatus(v));
        if (m === "POST") return json({ url: await c.calendar.issueFeed(v) });
        if (m === "DELETE") return (await c.calendar.revokeFeed(v), json({ ok: true }));
      }
      if (m === "GET") {
        const from = new Date(url.searchParams.get("from") ?? "");
        const to = new Date(url.searchParams.get("to") ?? "");
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new HttpError(400, "badRequest");
        const boardId = url.searchParams.get("boardId");
        return json({ cards: await c.calendar.range(v, from, to, { boardId: boardId && id.safeParse(boardId).success ? boardId : null, mine: url.searchParams.get("mine") === "1" }) });
      }
    }
    if (a === "views") {
      if (m === "GET") {
        const boardId = url.searchParams.get("boardId");
        return json({ views: await c.boards.views(v, boardId && id.safeParse(boardId).success ? boardId : null) });
      }
      if (m === "POST") return json({ id: await c.boards.saveView(v, await body(req, z.object({ boardId: optId.transform((x) => x ?? null), name: z.string().max(200), query: z.string().max(1000), shared: z.boolean().optional() }))) }, 201);
      if (m === "DELETE" && b) return (await c.boards.deleteView(v, id.parse(b)), json({ ok: true }));
    }
    if (a === "columns" && b) {
      const colId = id.parse(b);
      if (m === "PATCH") {
        const p = await body(req, z.object({ name: z.string().max(200).optional(), done: z.boolean().optional(), wipLimit: z.number().int().min(0).max(999).nullable().optional(), color: z.string().max(20).nullable().optional(), beforeId: optId, afterId: optId }));
        if (p.beforeId !== undefined || p.afterId !== undefined) await c.boards.moveColumn(v, colId, { beforeId: p.beforeId, afterId: p.afterId });
        await c.boards.updateColumn(v, colId, { name: p.name, done: p.done, wipLimit: p.wipLimit, color: p.color });
        return json({ ok: true });
      }
      if (m === "DELETE") return (await c.boards.deleteColumn(v, colId), json({ ok: true }));
    }
    if (a === "rules" && b) {
      const ruleId = id.parse(b);
      if (m === "PATCH") return (await c.boards.updateRule(v, ruleId, await body(req, z.object({ name: z.string().max(200).optional(), trigger: z.unknown().optional(), actions: z.unknown().optional(), enabled: z.boolean().optional() }))), json({ ok: true }));
      if (m === "DELETE") return (await c.boards.deleteRule(v, ruleId), json({ ok: true }));
    }
    if (a === "checklists" && b) {
      const listId = id.parse(b);
      if (d === "items" && m === "POST") return json({ id: await c.cards.addItem(v, listId, (await body(req, z.object({ text: z.string().max(1000) }))).text) }, 201);
      if (m === "PATCH") return (await c.cards.renameChecklist(v, listId, (await body(req, z.object({ title: z.string().max(200) }))).title), json({ ok: true }));
      if (m === "DELETE") return (await c.cards.deleteChecklist(v, listId), json({ ok: true }));
    }
    if (a === "items" && b) {
      const itemId = id.parse(b);
      if (m === "PATCH") return (await c.cards.updateItem(v, itemId, await body(req, z.object({ text: z.string().max(1000).optional(), done: z.boolean().optional(), assigneeId: optId, dueAt: isoish }))), json({ ok: true }));
      if (m === "DELETE") return (await c.cards.deleteItem(v, itemId), json({ ok: true }));
    }
    if (a === "comments" && b) {
      const commentId = id.parse(b);
      if (m === "PATCH") return (await c.cards.editComment(v, commentId, (await body(req, z.object({ text: z.string().max(10_000) }))).text), json({ ok: true }));
      if (m === "DELETE") return (await c.cards.deleteComment(v, commentId), json({ ok: true }));
    }

    // ─── Карточки ───
    if (a === "cards") {
      if (!b && m === "POST") {
        const cardId = await c.cards.create(v, await body(req, cardCreate));
        return json({ id: cardId, card: await c.cards.summary(v, cardId) }, 201);
      }
      if (b === "bulk" && m === "POST") {
        const p = await body(req, bulk);
        return json(await c.cards.bulk(v, p.ids, p.action));
      }
      const cardId = id.parse(b);
      if (!d) {
        if (m === "GET") return json(await c.cards.detail(v, cardId));
        if (m === "PATCH") return (await c.cards.update(v, cardId, await body(req, cardUpdate)), json({ card: await c.cards.summary(v, cardId) }));
        if (m === "DELETE") return (await c.cards.remove(v, cardId), json({ ok: true }));
      }
      if (d === "move" && m === "POST") {
        await c.cards.move(v, cardId, await body(req, z.object({ boardId: optId, columnId: id, beforeId: optId, afterId: optId })));
        return json({ card: await c.cards.summary(v, cardId) });
      }
      if (d === "done" && m === "POST") {
        const p = await body(req, z.object({ done: z.boolean(), result: z.string().max(500).nullable().optional() }));
        await c.cards.setDone(v, cardId, p.done, p.result);
        return json({ card: await c.cards.summary(v, cardId) });
      }
      if (d === "archive" && m === "POST") return (await c.cards.archive(v, cardId, (await body(req, z.object({ archived: z.boolean() }))).archived), json({ ok: true }));
      if (d === "duplicate" && m === "POST") return json({ id: await c.cards.duplicate(v, cardId) }, 201);
      if (d === "assignees" && m === "PUT") return (await c.cards.setAssignees(v, cardId, (await body(req, z.object({ userIds: z.array(id).max(20) }))).userIds), json({ card: await c.cards.summary(v, cardId) }));
      if (d === "watch" && m === "PUT") {
        const p = await body(req, z.object({ userId: id.optional(), on: z.boolean() }));
        await c.cards.setWatching(v, cardId, p.userId ?? v.userId, p.on);
        return json({ ok: true });
      }
      if (d === "labels" && e && m === "PUT") return (await c.cards.setLabel(v, cardId, id.parse(e), (await body(req, z.object({ on: z.boolean() }))).on), json({ card: await c.cards.summary(v, cardId) }));
      if (d === "checklists" && m === "POST") {
        const p = await body(req, z.object({ title: z.string().max(200), items: z.array(z.string().max(1000)).max(50).optional() }));
        return json({ id: await c.cards.addChecklist(v, cardId, p.title, p.items) }, 201);
      }
      if (d === "comments" && m === "POST") return json({ id: await c.cards.comment(v, cardId, (await body(req, z.object({ text: z.string().max(10_000) }))).text) }, 201);
      if (d === "files") {
        if (m === "POST") {
          const form = await req.formData();
          const file = form.get("file");
          if (!(file instanceof File)) throw new BoardsError("invalid", "Выберите файл");
          return json({ id: await c.cards.attach(v, cardId, { name: file.name, type: file.type, data: new Uint8Array(await file.arrayBuffer()) }) }, 201);
        }
        if (m === "DELETE" && e) return (await c.cards.detach(v, cardId, id.parse(e)), json({ ok: true }));
      }
    }

    // ─── Доска по id ───
    if (a && id.safeParse(a).success) {
      if (!b) {
        if (m === "GET") return json(await c.boards.view(v, a, { done: url.searchParams.get("done") === "1", archived: url.searchParams.get("archived") === "1" }));
        if (m === "PATCH") {
          const p = await body(req, z.object({ name: z.string().max(200).optional(), description: z.string().max(500).nullable().optional(), color: z.string().max(20).optional(), visibility: z.enum(["all", "members"]).optional(), archived: z.boolean().optional() }));
          if (p.archived !== undefined) await c.boards.archive(v, a, p.archived);
          await c.boards.update(v, a, p);
          return json({ ok: true });
        }
      }
      if (b === "columns" && m === "POST") return json({ id: await c.boards.addColumn(v, a, await body(req, z.object({ name: z.string().max(200), done: z.boolean().optional(), wipLimit: z.number().int().min(0).max(999).nullable().optional(), afterId: optId }))) }, 201);
      if (b === "labels") {
        if (!d && m === "POST") return json({ id: await c.boards.addLabel(v, a, await body(req, z.object({ name: z.string().max(100), color: z.string().max(20) }))) }, 201);
        if (d && m === "PATCH") return (await c.boards.updateLabel(v, a, id.parse(d), await body(req, z.object({ name: z.string().max(100).optional(), color: z.string().max(20).optional() }))), json({ ok: true }));
        if (d && m === "DELETE") return (await c.boards.deleteLabel(v, a, id.parse(d)), json({ ok: true }));
      }
      if (b === "members" && d && m === "PUT") return (await c.boards.setMember(v, a, id.parse(d), (await body(req, z.object({ role: z.enum(["admin", "member"]).nullable() }))).role), json({ ok: true }));
      if (b === "rules" && m === "POST") return json({ id: await c.boards.addRule(v, a, await body(req, z.object({ name: z.string().max(200), trigger: z.unknown(), actions: z.unknown() }))) }, 201);
    }
    return json({ error: "Не найдено", code: "notFound" }, 404);
  } catch (err) {
    if (BoardsError.is(err)) return json({ error: err.message, code: err.code }, boardsErrorStatus(err.code));
    if (HttpError.is(err)) return json({ error: err.status === 403 ? "Недостаточно прав" : err.status === 401 ? "Войдите заново" : "Неверный запрос", code: err.code }, err.status);
    if (err instanceof ZodError || err instanceof SyntaxError) return json({ error: "Неверные данные", code: "badData" }, 400);
    console.error("[boards api]", err);
    return json({ error: "Ошибка сервера, попробуйте ещё раз", code: "server" }, 500);
  }
}
