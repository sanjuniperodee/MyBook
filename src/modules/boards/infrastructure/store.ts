import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import {
  books,
  crmBoardColumns,
  crmBoardMembers,
  crmBoardRuleRuns,
  crmBoardRules,
  crmBoards,
  crmConversations,
  crmDeals,
  crmLabels,
  crmTaskActivity,
  crmTaskAttachments,
  crmTaskChecklistItems,
  crmTaskChecklists,
  crmTaskComments,
  crmTaskLabels,
  crmTaskMembers,
  crmTasks,
  crmTaskViews,
  orders,
  users,
} from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { crmBoardsId, crmBoardsIsDefault, crmTasksBoardId, crmTasksDueAt, crmTasksId } from "@/shared/infrastructure/db/refs";
import type { BoardKind, TaskPriority, TaskRecurrence } from "@/shared/domain/boards";
import type { BoardRow, BoardsStore, CardRow, ColumnRow, TaskKind } from "../application/ports";

const boardCols = {
  id: crmBoards.id,
  name: crmBoards.name,
  description: crmBoards.description,
  kind: crmBoards.kind,
  department: crmBoards.department,
  color: crmBoards.color,
  ownerId: crmBoards.ownerId,
  visibility: crmBoards.visibility,
  isDefault: crmBoards.isDefault,
  templateKey: crmBoards.templateKey,
  position: crmBoards.position,
  archivedAt: crmBoards.archivedAt,
};

const memberRoleOf = (userId: string) => sql<"admin" | "member" | null>`(select m.role from crm_board_members m where m.board_id = ${crmBoardsId} and m.user_id = ${userId})`;

/** Выборка карточки: задача, то, к чему она, участники, метки и счётчики — одним запросом. */
const cardSelect = {
  id: crmTasks.id,
  title: crmTasks.title,
  kind: crmTasks.kind,
  boardId: crmTasks.boardId,
  columnId: crmTasks.columnId,
  position: crmTasks.position,
  description: crmTasks.description,
  priority: crmTasks.priority,
  startAt: crmTasks.startAt,
  dueAt: crmTasks.dueAt,
  doneAt: crmTasks.doneAt,
  archivedAt: crmTasks.archivedAt,
  cover: crmTasks.cover,
  assigneeId: crmTasks.assigneeId,
  createdById: crmTasks.createdById,
  createdAt: crmTasks.createdAt,
  updatedAt: crmTasks.updatedAt,
  remindBeforeMin: crmTasks.remindBeforeMin,
  result: crmTasks.result,
  estimateMin: crmTasks.estimateMin,
  spentMin: crmTasks.spentMin,
  recurrence: crmTasks.recurrence,
  meet: crmTasks.meet,
  dealId: crmTasks.dealId,
  orderId: crmTasks.orderId,
  clientId: crmTasks.clientId,
  bookId: crmTasks.bookId,
  conversationId: crmTasks.conversationId,
  dealNumber: crmDeals.number,
  dealTitle: crmDeals.title,
  dealContact: crmDeals.contactName,
  orderNumber: orders.number,
  clientName: users.name,
  bookTitle: books.title,
  chatName: crmConversations.contactName,
  members: sql<{ userId: string; role: "assignee" | "watcher" }[]>`coalesce((select json_agg(json_build_object('userId', m.user_id, 'role', m.role)) from crm_task_members m where m.task_id = ${crmTasksId}), '[]'::json)`,
  labels: sql<{ id: string; auto: boolean }[]>`coalesce((select json_agg(json_build_object('id', l.label_id, 'auto', l.auto)) from crm_task_labels l where l.task_id = ${crmTasksId}), '[]'::json)`,
  checklistDone: sql<number>`(select count(*) filter (where i.done_at is not null)::int from crm_task_checklist_items i join crm_task_checklists c on c.id = i.checklist_id where c.task_id = ${crmTasksId})`,
  checklistTotal: sql<number>`(select count(*)::int from crm_task_checklist_items i join crm_task_checklists c on c.id = i.checklist_id where c.task_id = ${crmTasksId})`,
  comments: sql<number>`(select count(*)::int from crm_task_comments c where c.task_id = ${crmTasksId})`,
  attachments: sql<number>`(select count(*)::int from crm_task_attachments a where a.task_id = ${crmTasksId})`,
};

function cardQuery() {
  return executor()
    .select(cardSelect)
    .from(crmTasks)
    .leftJoin(crmDeals, eq(crmDeals.id, crmTasks.dealId))
    .leftJoin(orders, eq(orders.id, crmTasks.orderId))
    .leftJoin(users, eq(users.id, crmTasks.clientId))
    .leftJoin(books, eq(books.id, crmTasks.bookId))
    .leftJoin(crmConversations, eq(crmConversations.id, crmTasks.conversationId));
}

const toCard = (r: Awaited<ReturnType<typeof cardQuery>>[number]): CardRow => ({
  ...r,
  kind: r.kind as TaskKind,
  priority: (r.priority ?? null) as TaskPriority | null,
  recurrence: (r.recurrence ?? null) as TaskRecurrence | null,
  members: r.members ?? [],
  labels: r.labels ?? [],
});

const onBoard = (boardId: string, isDefault: boolean): SQL => (isDefault ? or(eq(crmTasks.boardId, boardId), isNull(crmTasks.boardId))! : eq(crmTasks.boardId, boardId));

export const drizzleBoards: BoardsStore = {
  async boards(userId, opts) {
    const rows = await executor()
      .select({
        ...boardCols,
        memberRole: memberRoleOf(userId),
        openCards: sql<number>`(select count(*)::int from crm_tasks t where (t.board_id = ${crmBoardsId} or (${crmBoardsIsDefault} and t.board_id is null)) and t.done_at is null and t.archived_at is null)`,
      })
      .from(crmBoards)
      .where(opts?.archived ? isNotNull(crmBoards.archivedAt) : isNull(crmBoards.archivedAt))
      .orderBy(asc(crmBoards.position), asc(crmBoards.createdAt));
    return rows.map((r) => ({ ...r, kind: r.kind as BoardKind }));
  },
  async board(id, userId) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await executor()
      .select({ ...boardCols, memberRole: memberRoleOf(userId) })
      .from(crmBoards)
      .where(eq(crmBoards.id, id))
      .limit(1);
    return r ? ({ ...r, kind: r.kind as BoardKind } as BoardRow) : null;
  },
  async defaultBoard() {
    const [r] = await executor().select(boardCols).from(crmBoards).where(eq(crmBoards.isDefault, true)).limit(1);
    return r ? ({ ...r, kind: r.kind as BoardKind, memberRole: null } as BoardRow) : null;
  },
  async createBoard(b) {
    const [{ max }] = await executor()
      .select({ max: sql<number>`coalesce(max(${crmBoards.position}), 0)` })
      .from(crmBoards);
    const [r] = await executor()
      .insert(crmBoards)
      .values({ ...b, position: Number(max) + 1024 })
      .returning({ id: crmBoards.id });
    return r.id;
  },
  updateBoard: async (id, patch) => void (await executor().update(crmBoards).set({ ...patch, updatedAt: new Date() }).where(eq(crmBoards.id, id))),

  columns: (boardId) => executor().select({ id: crmBoardColumns.id, boardId: crmBoardColumns.boardId, name: crmBoardColumns.name, position: crmBoardColumns.position, done: crmBoardColumns.done, wipLimit: crmBoardColumns.wipLimit, color: crmBoardColumns.color }).from(crmBoardColumns).where(eq(crmBoardColumns.boardId, boardId)).orderBy(asc(crmBoardColumns.position)),
  async column(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [c] = await executor().select().from(crmBoardColumns).where(eq(crmBoardColumns.id, id)).limit(1);
    return (c as ColumnRow | undefined) ?? null;
  },
  async addColumn(c) {
    const [r] = await executor().insert(crmBoardColumns).values(c).returning({ id: crmBoardColumns.id });
    return r.id;
  },
  updateColumn: async (id, patch) => void (await executor().update(crmBoardColumns).set(patch).where(eq(crmBoardColumns.id, id))),
  async deleteColumn(id, to) {
    await executor().update(crmTasks).set({ columnId: to }).where(eq(crmTasks.columnId, id));
    await executor().delete(crmBoardColumns).where(eq(crmBoardColumns.id, id));
  },

  labels: (boardId) => executor().select({ id: crmLabels.id, boardId: crmLabels.boardId, name: crmLabels.name, color: crmLabels.color, position: crmLabels.position }).from(crmLabels).where(eq(crmLabels.boardId, boardId)).orderBy(asc(crmLabels.position), asc(crmLabels.createdAt)),
  async addLabel(l) {
    const [r] = await executor().insert(crmLabels).values(l).returning({ id: crmLabels.id });
    return r.id;
  },
  updateLabel: async (id, patch) => void (await executor().update(crmLabels).set(patch).where(eq(crmLabels.id, id))),
  deleteLabel: async (id) => void (await executor().delete(crmLabels).where(eq(crmLabels.id, id))),

  members: (boardId) => executor().select({ userId: crmBoardMembers.userId, role: crmBoardMembers.role }).from(crmBoardMembers).where(eq(crmBoardMembers.boardId, boardId)),
  setBoardMember: async (boardId, userId, role) =>
    void (await executor()
      .insert(crmBoardMembers)
      .values({ boardId, userId, role })
      .onConflictDoUpdate({ target: [crmBoardMembers.boardId, crmBoardMembers.userId], set: { role } })),
  removeBoardMember: async (boardId, userId) => void (await executor().delete(crmBoardMembers).where(and(eq(crmBoardMembers.boardId, boardId), eq(crmBoardMembers.userId, userId)))),

  rules: (boardId) => executor().select({ id: crmBoardRules.id, boardId: crmBoardRules.boardId, name: crmBoardRules.name, trigger: crmBoardRules.trigger, actions: crmBoardRules.actions, enabled: crmBoardRules.enabled, position: crmBoardRules.position, runs: crmBoardRules.runs, lastRunAt: crmBoardRules.lastRunAt }).from(crmBoardRules).where(eq(crmBoardRules.boardId, boardId)).orderBy(asc(crmBoardRules.position), asc(crmBoardRules.createdAt)),
  async rule(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await executor().select().from(crmBoardRules).where(eq(crmBoardRules.id, id)).limit(1);
    return r ?? null;
  },
  async addRule(r) {
    const [x] = await executor().insert(crmBoardRules).values(r).returning({ id: crmBoardRules.id });
    return x.id;
  },
  updateRule: async (id, patch) => void (await executor().update(crmBoardRules).set(patch).where(eq(crmBoardRules.id, id))),
  deleteRule: async (id) => void (await executor().delete(crmBoardRules).where(eq(crmBoardRules.id, id))),
  ruleFired: async (id, at) => void (await executor().update(crmBoardRules).set({ runs: sql`${crmBoardRules.runs} + 1`, lastRunAt: at }).where(eq(crmBoardRules.id, id))),
  async claimRuleRun(ruleId, taskId, key) {
    const rows = await executor().insert(crmBoardRuleRuns).values({ ruleId, taskId, key }).onConflictDoNothing().returning({ k: crmBoardRuleRuns.key });
    return rows.length > 0;
  },

  async cards(boardId, isDefault, opts) {
    const rows = await cardQuery()
      .where(and(onBoard(boardId, isDefault), opts.archived ? isNotNull(crmTasks.archivedAt) : isNull(crmTasks.archivedAt), opts.archived ? undefined : or(isNull(crmTasks.doneAt), opts.doneSince ? gt(crmTasks.doneAt, opts.doneSince) : sql`true`)))
      .orderBy(sql`${crmTasks.position} asc nulls last`, sql`${crmTasks.dueAt} asc nulls last`, asc(crmTasks.createdAt))
      .limit(opts.archived ? 300 : 3000);
    return rows.map(toCard);
  },
  async card(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await cardQuery().where(eq(crmTasks.id, id)).limit(1);
    return r ? toCard(r) : null;
  },
  async cardsInRange(from, to, opts) {
    const inRange = or(and(sql`${crmTasks.dueAt} >= ${from}`, sql`${crmTasks.dueAt} < ${to}`), and(sql`${crmTasks.startAt} < ${to}`, sql`coalesce(${crmTasks.dueAt}, ${crmTasks.startAt}) >= ${from}`));
    const boards = opts.boardIds ? (opts.boardIds.length ? or(inArray(crmTasks.boardId, opts.boardIds), opts.includeDefaultNull ? isNull(crmTasks.boardId) : undefined) : sql`false`) : undefined;
    const who = opts.userId;
    const mine = who ? or(eq(crmTasks.assigneeId, who), sql`exists (select 1 from crm_task_members m where m.task_id = ${crmTasksId} and m.user_id = ${who})`) : undefined;
    const rows = await cardQuery()
      .where(and(isNull(crmTasks.archivedAt), inRange, boards, mine))
      .orderBy(asc(crmTasks.dueAt))
      .limit(2000);
    return rows.map(toCard);
  },
  async insertCard(c) {
    const [r] = await executor().insert(crmTasks).values(c).returning({ id: crmTasks.id });
    return r.id;
  },
  async updateCard(id, patch) {
    if (!Object.keys(patch).length) return;
    await executor().update(crmTasks).set(patch).where(eq(crmTasks.id, id));
  },
  touch: async (id) => void (await executor().update(crmTasks).set({ updatedAt: new Date() }).where(eq(crmTasks.id, id))),
  deleteCard: async (id) => void (await executor().delete(crmTasks).where(eq(crmTasks.id, id))),
  async columnPositions(boardId, isDefault, columnId) {
    return executor()
      .select({ id: crmTasks.id, position: crmTasks.position })
      .from(crmTasks)
      .where(and(onBoard(boardId, isDefault), eq(crmTasks.columnId, columnId), isNull(crmTasks.archivedAt)))
      .orderBy(sql`${crmTasks.position} asc nulls last`, sql`${crmTasks.dueAt} asc nulls last`, asc(crmTasks.createdAt));
  },
  async renumber(ids) {
    if (!ids.length) return;
    // Один UPDATE: позиция = порядковый номер × 1024.
    await executor().execute(sql`update crm_tasks t set position = v.pos from (select unnest(${sql.raw(`ARRAY[${ids.map((i) => `'${i.replace(/[^0-9a-f-]/gi, "")}'`).join(",")}]::uuid[]`)}) as id, generate_series(1, ${ids.length}) * 1024.0 as pos) v where t.id = v.id`);
  },
  async setMembers(taskId, role, userIds) {
    await executor().delete(crmTaskMembers).where(and(eq(crmTaskMembers.taskId, taskId), eq(crmTaskMembers.role, role)));
    if (userIds.length) await executor().insert(crmTaskMembers).values(userIds.map((userId) => ({ taskId, userId, role }))).onConflictDoNothing();
  },
  addMember: async (taskId, userId, role) => void (await executor().insert(crmTaskMembers).values({ taskId, userId, role }).onConflictDoNothing()),
  removeMember: async (taskId, userId, role) => void (await executor().delete(crmTaskMembers).where(and(eq(crmTaskMembers.taskId, taskId), eq(crmTaskMembers.userId, userId), eq(crmTaskMembers.role, role)))),
  async addLabel2(taskId, labelId, auto) {
    const rows = await executor().insert(crmTaskLabels).values({ taskId, labelId, auto }).onConflictDoNothing().returning({ t: crmTaskLabels.taskId });
    return rows.length > 0;
  },
  async removeLabel2(taskId, labelId) {
    const rows = await executor()
      .delete(crmTaskLabels)
      .where(and(eq(crmTaskLabels.taskId, taskId), eq(crmTaskLabels.labelId, labelId)))
      .returning({ t: crmTaskLabels.taskId });
    return rows.length > 0;
  },
  async removeAutoLabels(taskId) {
    const rows = await executor()
      .delete(crmTaskLabels)
      .where(and(eq(crmTaskLabels.taskId, taskId), eq(crmTaskLabels.auto, true)))
      .returning({ t: crmTaskLabels.taskId });
    return rows.length;
  },

  async checklists(taskId) {
    const lists = await executor().select().from(crmTaskChecklists).where(eq(crmTaskChecklists.taskId, taskId)).orderBy(asc(crmTaskChecklists.position), asc(crmTaskChecklists.createdAt));
    if (!lists.length) return [];
    const items = await executor()
      .select()
      .from(crmTaskChecklistItems)
      .where(
        inArray(
          crmTaskChecklistItems.checklistId,
          lists.map((l) => l.id),
        ),
      )
      .orderBy(asc(crmTaskChecklistItems.position), asc(crmTaskChecklistItems.createdAt));
    return lists.map((l) => ({
      id: l.id,
      taskId: l.taskId,
      title: l.title,
      position: l.position,
      items: items.filter((i) => i.checklistId === l.id).map((i) => ({ id: i.id, text: i.text, position: i.position, doneAt: i.doneAt, doneById: i.doneById, assigneeId: i.assigneeId, dueAt: i.dueAt })),
    }));
  },
  async addChecklist(taskId, title, items) {
    const [{ max }] = await executor()
      .select({ max: sql<number>`coalesce(max(${crmTaskChecklists.position}), 0)` })
      .from(crmTaskChecklists)
      .where(eq(crmTaskChecklists.taskId, taskId));
    const [l] = await executor()
      .insert(crmTaskChecklists)
      .values({ taskId, title, position: Number(max) + 1024 })
      .returning({ id: crmTaskChecklists.id });
    if (items.length) await executor().insert(crmTaskChecklistItems).values(items.map((text, i) => ({ checklistId: l.id, text, position: (i + 1) * 1024 })));
    return l.id;
  },
  renameChecklist: async (id, title) => void (await executor().update(crmTaskChecklists).set({ title }).where(eq(crmTaskChecklists.id, id))),
  deleteChecklist: async (id) => void (await executor().delete(crmTaskChecklists).where(eq(crmTaskChecklists.id, id))),
  async checklistOf(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [l] = await executor().select({ id: crmTaskChecklists.id, taskId: crmTaskChecklists.taskId }).from(crmTaskChecklists).where(eq(crmTaskChecklists.id, id)).limit(1);
    return l ?? null;
  },
  async itemOf(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [i] = await executor()
      .select({ id: crmTaskChecklistItems.id, checklistId: crmTaskChecklistItems.checklistId, taskId: crmTaskChecklists.taskId, doneAt: crmTaskChecklistItems.doneAt, text: crmTaskChecklistItems.text })
      .from(crmTaskChecklistItems)
      .innerJoin(crmTaskChecklists, eq(crmTaskChecklists.id, crmTaskChecklistItems.checklistId))
      .where(eq(crmTaskChecklistItems.id, id))
      .limit(1);
    return i ?? null;
  },
  async addItem(checklistId, text) {
    const [{ max }] = await executor()
      .select({ max: sql<number>`coalesce(max(${crmTaskChecklistItems.position}), 0)` })
      .from(crmTaskChecklistItems)
      .where(eq(crmTaskChecklistItems.checklistId, checklistId));
    const [r] = await executor()
      .insert(crmTaskChecklistItems)
      .values({ checklistId, text, position: Number(max) + 1024 })
      .returning({ id: crmTaskChecklistItems.id });
    return r.id;
  },
  updateItem: async (id, patch) => void (await executor().update(crmTaskChecklistItems).set(patch).where(eq(crmTaskChecklistItems.id, id))),
  deleteItem: async (id) => void (await executor().delete(crmTaskChecklistItems).where(eq(crmTaskChecklistItems.id, id))),

  comments: (taskId) => executor().select().from(crmTaskComments).where(eq(crmTaskComments.taskId, taskId)).orderBy(asc(crmTaskComments.createdAt)),
  async comment(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [c] = await executor().select().from(crmTaskComments).where(eq(crmTaskComments.id, id)).limit(1);
    return c ?? null;
  },
  async addComment(taskId, authorId, text) {
    const [r] = await executor().insert(crmTaskComments).values({ taskId, authorId, text }).returning({ id: crmTaskComments.id });
    return r.id;
  },
  editComment: async (id, text, at) => void (await executor().update(crmTaskComments).set({ text, editedAt: at }).where(eq(crmTaskComments.id, id))),
  deleteComment: async (id) => void (await executor().delete(crmTaskComments).where(eq(crmTaskComments.id, id))),

  attachments: (taskId) => executor().select().from(crmTaskAttachments).where(eq(crmTaskAttachments.taskId, taskId)).orderBy(desc(crmTaskAttachments.createdAt)),
  async attachment(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [a] = await executor().select().from(crmTaskAttachments).where(eq(crmTaskAttachments.id, id)).limit(1);
    return a ?? null;
  },
  addAttachment: async (a) => void (await executor().insert(crmTaskAttachments).values(a)),
  deleteAttachment: async (id) => void (await executor().delete(crmTaskAttachments).where(eq(crmTaskAttachments.id, id))),

  activity: (taskId, limit) => executor().select().from(crmTaskActivity).where(eq(crmTaskActivity.taskId, taskId)).orderBy(desc(crmTaskActivity.createdAt)).limit(limit),
  log: async (taskId, actorId, kind, data = {}) => void (await executor().insert(crmTaskActivity).values({ taskId, actorId, kind, data })),

  views: (userId, boardId) =>
    executor()
      .select({ id: crmTaskViews.id, userId: crmTaskViews.userId, boardId: crmTaskViews.boardId, name: crmTaskViews.name, query: crmTaskViews.query, shared: crmTaskViews.shared })
      .from(crmTaskViews)
      .where(and(or(eq(crmTaskViews.userId, userId), eq(crmTaskViews.shared, true)), boardId ? or(eq(crmTaskViews.boardId, boardId), isNull(crmTaskViews.boardId)) : isNull(crmTaskViews.boardId)))
      .orderBy(asc(crmTaskViews.createdAt)),
  async addView(v) {
    const [r] = await executor().insert(crmTaskViews).values(v).returning({ id: crmTaskViews.id });
    return r.id;
  },
  async view(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [v] = await executor().select({ id: crmTaskViews.id, userId: crmTaskViews.userId, boardId: crmTaskViews.boardId, name: crmTaskViews.name, query: crmTaskViews.query, shared: crmTaskViews.shared }).from(crmTaskViews).where(eq(crmTaskViews.id, id)).limit(1);
    return v ?? null;
  },
  deleteView: async (id) => void (await executor().delete(crmTaskViews).where(eq(crmTaskViews.id, id))),

  async overdueCards(now, limit) {
    // Открытые со сроком в окне «неделя назад — сейчас» на досках, где есть включённое правило «срок прошёл».
    const rows = await executor()
      .select({ taskId: crmTasks.id, boardId: sql<string>`coalesce(${crmTasksBoardId}, (select b.id from crm_boards b where b.is_default))`, dueAt: crmTasks.dueAt })
      .from(crmTasks)
      .where(
        and(
          isNull(crmTasks.doneAt),
          isNull(crmTasks.archivedAt),
          lt(crmTasks.dueAt, now),
          sql`${crmTasks.dueAt} > ${now}::timestamptz - interval '7 days'`,
          sql`exists (select 1 from crm_board_rules r where r.enabled and r.trigger->>'type' = 'card.overdue' and r.board_id = coalesce(${crmTasksBoardId}, (select b.id from crm_boards b where b.is_default))
                and not exists (select 1 from crm_board_rule_runs x where x.rule_id = r.id and x.task_id = ${crmTasksId} and x.key = to_char(${crmTasksDueAt} at time zone 'UTC', 'YYYYMMDDHH24MI')))`,
        ),
      )
      .orderBy(asc(crmTasks.dueAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, dueAt: r.dueAt as Date }));
  },
  async recurringDone(limit) {
    const rows = await cardQuery()
      .where(and(isNotNull(crmTasks.recurrence), isNotNull(crmTasks.doneAt), isNull(crmTasks.recurSpawnedAt)))
      .limit(limit);
    return rows.map(toCard);
  },
  async resolvedAutoLabels(now, limit) {
    const rows = await executor()
      .selectDistinct({ id: crmTaskLabels.taskId })
      .from(crmTaskLabels)
      .innerJoin(crmTasks, eq(crmTasks.id, crmTaskLabels.taskId))
      .where(and(eq(crmTaskLabels.auto, true), or(isNotNull(crmTasks.doneAt), isNull(crmTasks.dueAt), gt(crmTasks.dueAt, now))))
      .limit(limit);
    return rows.map((r) => r.id);
  },
  async staffName(id) {
    const [u] = await executor().select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
    return u?.name ?? null;
  },
  async activeStaff(ids) {
    const clean = [...new Set(ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)))];
    if (!clean.length) return [];
    const rows = await executor()
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, clean), eq(users.role, "admin"), eq(users.staffDisabled, false)));
    return rows.map((r) => r.id);
  },
};
