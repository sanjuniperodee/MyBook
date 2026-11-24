import type { Clock } from "@/shared/application";
import { BOARD_TEMPLATES, boardTemplate, isBoardColor, positionBetween, type BoardColor, type BoardKind, type BoardRuleAction } from "@/shared/domain/boards";
import { BoardsError, canEditCard, canManageBoard, canSeeBoard, canSeeCard, effectiveColumn, validateRule, type BoardViewer } from "../domain";
import type { BoardRow, BoardsLive, BoardsStore, CardRow } from "./ports";
import { boardSummary, cardSummary, columnView, labelView, ruleView, type BoardSummary, type BoardView, type CardSummary } from "./views";

/** Выполненные карточки показываются на доске столько дней (дальше — архив, поиск «Задач»). */
export const DONE_DAYS = 14;

const clientLinked = (c: Pick<CardRow, "dealId" | "orderId" | "clientId" | "conversationId">) => !!(c.dealId || c.orderId || c.clientId || c.conversationId);

/** Права зрителя на карточку доски: видит ли, меняет ли. */
export function cardAccess(v: BoardViewer, c: CardRow, boardAdmin: boolean) {
  const info = { assigneeId: c.assigneeId, createdById: c.createdById, clientLinked: clientLinked(c), memberIds: c.members.map((m) => m.userId) };
  return { see: canSeeCard(v, info), edit: canEditCard(v, { ...info, boardAdmin }) };
}

const name = (s: string, max = 80) => {
  const t = s.trim().replace(/\s+/g, " ").slice(0, max);
  if (!t) throw new BoardsError("invalid", "Введите название");
  return t;
};

/** Доски: список, доска с карточками, создание по шаблону, колонки, метки, участники, правила. */
export class BoardsService {
  constructor(
    private readonly store: BoardsStore,
    private readonly live: BoardsLive,
    private readonly clock: Clock,
  ) {}

  /** Доска, которую зритель видит (иначе — «не найдена»). */
  async visible(v: BoardViewer, id: string): Promise<BoardRow> {
    const b = await this.store.board(id, v.userId);
    if (!b || !canSeeBoard(v, b)) throw new BoardsError("notFound", "Доска не найдена");
    return b;
  }

  /** Доска, которую зритель может настраивать. */
  async managed(v: BoardViewer, id: string): Promise<BoardRow> {
    const b = await this.visible(v, id);
    if (!canManageBoard(v, b)) throw new BoardsError("forbidden", "Настраивать доску может её владелец, админ доски или руководитель");
    return b;
  }

  async list(v: BoardViewer, opts?: { archived?: boolean }): Promise<BoardSummary[]> {
    const rows = await this.store.boards(v.userId, opts);
    return rows.filter((b) => canSeeBoard(v, b)).map((b) => boardSummary(b, canManageBoard(v, b), b.openCards));
  }

  templates() {
    return BOARD_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, kind: t.kind, color: t.color, columns: t.columns.map((c) => c.name) }));
  }

  /** Доска с колонками, метками, участниками, правилами и видимыми зрителю карточками. */
  async view(v: BoardViewer, id: string, opts: { done?: boolean; archived?: boolean } = {}): Promise<BoardView> {
    const b = await this.visible(v, id);
    const admin = canManageBoard(v, b);
    const now = this.clock.now();
    const [columns, labels, members, rules, rows] = await Promise.all([
      this.store.columns(b.id),
      this.store.labels(b.id),
      this.store.members(b.id),
      this.store.rules(b.id),
      this.store.cards(b.id, b.isDefault, { doneSince: opts.done ? new Date(now.getTime() - 90 * 86_400_000) : new Date(now.getTime() - DONE_DAYS * 86_400_000), archived: opts.archived }),
    ]);
    const cards: CardSummary[] = [];
    for (const c of rows) {
      const a = cardAccess(v, c, admin);
      if (!a.see) continue;
      cards.push(cardSummary(c, effectiveColumn(columns, c.columnId, !!c.doneAt), a.edit));
    }
    return { board: boardSummary(b, admin), columns: columns.map(columnView), labels: labels.map(labelView), members, rules: rules.map(ruleView), cards, doneDays: opts.done ? 90 : DONE_DAYS };
  }

  /**
   * Новая доска по шаблону (или копия своей — from): колонки, метки и правила. Общая доска отдела — только с правом
   * boards.manage; личную и проект заводит любой сотрудник, он — её владелец и админ.
   */
  async create(v: BoardViewer, input: { name: string; template?: string | null; from?: string | null; kind?: BoardKind; visibility?: "all" | "members"; description?: string | null; color?: string | null }) {
    const source = input.from ? await this.visible(v, input.from) : null;
    const tpl = source ? null : boardTemplate(input.template ?? "project");
    const kind: BoardKind = input.kind ?? source?.kind ?? tpl?.kind ?? "project";
    if (kind === "team" && !v.manageBoards) throw new BoardsError("forbidden", "Общие доски отделов заводит руководитель (право «Доски»)");
    const visibility = kind === "personal" ? "members" : (input.visibility ?? (kind === "team" ? "all" : "members"));
    const color: BoardColor = isBoardColor(input.color) ? input.color : isBoardColor(source?.color) ? source.color : (tpl?.color ?? "slate");
    const id = await this.store.createBoard({ name: name(input.name), description: input.description?.trim().slice(0, 300) || (source ? source.description : (tpl?.description ?? null)), kind, department: source?.department ?? tpl?.department ?? null, color, ownerId: v.userId, visibility, templateKey: tpl?.key ?? source?.templateKey ?? null });
    await this.store.setBoardMember(id, v.userId, "admin");
    if (source) {
      const [cols, labels, rules] = await Promise.all([this.store.columns(source.id), this.store.labels(source.id), this.store.rules(source.id)]);
      const colMap = new Map<string, string>();
      const labelMap = new Map<string, string>();
      for (const c of cols) colMap.set(c.id, await this.store.addColumn({ boardId: id, name: c.name, position: c.position, done: c.done, wipLimit: c.wipLimit }));
      for (const l of labels) labelMap.set(l.id, await this.store.addLabel({ boardId: id, name: l.name, color: l.color, position: l.position }));
      for (const r of rules) {
        const remap = (x: string) => colMap.get(x) ?? labelMap.get(x) ?? x;
        const trigger = "columnId" in r.trigger && r.trigger.columnId ? { ...r.trigger, columnId: remap(r.trigger.columnId) } : r.trigger;
        const actions = r.actions.map((a) => ("columnId" in a ? { ...a, columnId: remap(a.columnId) } : "labelId" in a ? { ...a, labelId: remap(a.labelId) } : a)) as BoardRuleAction[];
        await this.store.addRule({ boardId: id, name: r.name, trigger: trigger as typeof r.trigger, actions, position: r.position, createdById: v.userId, enabled: r.enabled });
      }
    } else if (tpl) {
      const colIds: string[] = [];
      const labelIds: string[] = [];
      for (const [i, c] of tpl.columns.entries()) colIds.push(await this.store.addColumn({ boardId: id, name: c.name, position: (i + 1) * 1024, done: !!c.done, wipLimit: c.wip ?? null }));
      for (const [i, l] of tpl.labels.entries()) labelIds.push(await this.store.addLabel({ boardId: id, name: l.name, color: l.color, position: (i + 1) * 1024 }));
      for (const [i, r] of tpl.rules.entries()) {
        const trigger = r.trigger.type === "card.moved" ? { type: "card.moved" as const, columnId: colIds[r.trigger.column ?? 0] } : r.trigger.type === "card.added" ? { type: "card.added" as const, columnId: r.trigger.column == null ? null : colIds[r.trigger.column] } : { type: r.trigger.type };
        const actions = r.actions.map((a) => (a.type === "add_label" || a.type === "remove_label" ? { type: a.type, labelId: labelIds[a.label] } : a)) as BoardRuleAction[];
        await this.store.addRule({ boardId: id, name: r.name, trigger: trigger as never, actions, position: (i + 1) * 1024, createdById: v.userId });
      }
    }
    return id;
  }

  async update(v: BoardViewer, id: string, patch: { name?: string; description?: string | null; color?: string; visibility?: "all" | "members" }) {
    const b = await this.managed(v, id);
    const next: Parameters<BoardsStore["updateBoard"]>[1] = {};
    if (patch.name !== undefined) next.name = name(patch.name);
    if (patch.description !== undefined) next.description = patch.description?.trim().slice(0, 300) || null;
    if (patch.color !== undefined && isBoardColor(patch.color)) next.color = patch.color;
    if (patch.visibility !== undefined && b.kind !== "personal") {
      if (b.kind === "team" && patch.visibility === "members" && b.isDefault) throw new BoardsError("invalid", "Доска по умолчанию видна всем");
      next.visibility = patch.visibility;
    }
    await this.store.updateBoard(b.id, next);
    await this.live.boardChanged(b.id);
  }

  /** В архив и обратно. Доску по умолчанию в архив не убрать — на неё попадают задачи из сделок. */
  async archive(v: BoardViewer, id: string, archived: boolean) {
    const b = await this.managed(v, id);
    if (b.isDefault && archived) throw new BoardsError("invalid", "Доска по умолчанию не убирается в архив: на неё попадают задачи из сделок и правил");
    await this.store.updateBoard(b.id, { archivedAt: archived ? this.clock.now() : null });
    await this.live.boardChanged(b.id);
  }

  async reorderBoards(v: BoardViewer, ids: string[]) {
    if (!v.manageBoards) throw new BoardsError("forbidden");
    for (const [i, id] of ids.slice(0, 200).entries()) await this.store.updateBoard(id, { position: (i + 1) * 1024 });
  }

  // ─── Колонки ───

  async addColumn(v: BoardViewer, boardId: string, input: { name: string; done?: boolean; wipLimit?: number | null; afterId?: string | null }) {
    const b = await this.managed(v, boardId);
    const cols = await this.store.columns(b.id);
    const idx = input.afterId ? cols.findIndex((c) => c.id === input.afterId) : cols.length - 1 - (cols.at(-1)?.done ? 1 : 0);
    const position = positionBetween(cols[idx]?.position ?? null, cols[idx + 1]?.position ?? null);
    const id = await this.store.addColumn({ boardId: b.id, name: name(input.name, 60), position, done: !!input.done, wipLimit: wip(input.wipLimit) });
    await this.live.boardChanged(b.id);
    return id;
  }

  async updateColumn(v: BoardViewer, columnId: string, patch: { name?: string; done?: boolean; wipLimit?: number | null; color?: string | null }) {
    const col = await this.store.column(columnId);
    if (!col) throw new BoardsError("notFound", "Колонка не найдена");
    await this.managed(v, col.boardId);
    await this.store.updateColumn(col.id, { ...(patch.name !== undefined ? { name: name(patch.name, 60) } : {}), ...(patch.done !== undefined ? { done: patch.done } : {}), ...(patch.wipLimit !== undefined ? { wipLimit: wip(patch.wipLimit) } : {}), ...(patch.color !== undefined ? { color: isBoardColor(patch.color) ? patch.color : null } : {}) });
    await this.live.boardChanged(col.boardId);
  }

  /** Перенос колонки: встать между соседями before/after (id соседних колонок после переноса). */
  async moveColumn(v: BoardViewer, columnId: string, to: { beforeId?: string | null; afterId?: string | null }) {
    const col = await this.store.column(columnId);
    if (!col) throw new BoardsError("notFound", "Колонка не найдена");
    await this.managed(v, col.boardId);
    const cols = (await this.store.columns(col.boardId)).filter((c) => c.id !== col.id);
    const before = to.beforeId ? cols.find((c) => c.id === to.beforeId) : null;
    const after = to.afterId ? cols.find((c) => c.id === to.afterId) : null;
    let position = positionBetween(before?.position ?? null, after?.position ?? null);
    if (before && after && Math.abs(after.position - before.position) < 1e-6) {
      // Сблизились — переложить колонки шагом 1024 и вставить снова.
      for (const [i, c] of cols.entries()) await this.store.updateColumn(c.id, { position: (i + 1) * 1024 });
      position = (cols.findIndex((c) => c.id === before.id) + 1) * 1024 + 512;
    }
    await this.store.updateColumn(col.id, { position });
    await this.live.boardChanged(col.boardId);
  }

  /** Удалить колонку: её карточки уходят в соседнюю (первую оставшуюся открытую). */
  async deleteColumn(v: BoardViewer, columnId: string) {
    const col = await this.store.column(columnId);
    if (!col) throw new BoardsError("notFound", "Колонка не найдена");
    await this.managed(v, col.boardId);
    const rest = (await this.store.columns(col.boardId)).filter((c) => c.id !== col.id);
    if (!rest.length) throw new BoardsError("invalid", "На доске должна остаться хотя бы одна колонка");
    const to = col.done ? (rest.find((c) => c.done) ?? rest[0]) : (rest.find((c) => !c.done) ?? rest[0]);
    await this.store.deleteColumn(col.id, to.id);
    await this.live.boardChanged(col.boardId);
  }

  // ─── Метки ───

  async addLabel(v: BoardViewer, boardId: string, input: { name: string; color: string }) {
    const b = await this.visible(v, boardId);
    const labels = await this.store.labels(b.id);
    const id = await this.store.addLabel({ boardId: b.id, name: name(input.name, 40), color: isBoardColor(input.color) ? input.color : "slate", position: (labels.at(-1)?.position ?? 0) + 1024 });
    await this.live.boardChanged(b.id);
    return id;
  }

  async updateLabel(v: BoardViewer, boardId: string, labelId: string, patch: { name?: string; color?: string }) {
    const b = await this.managed(v, boardId);
    if (!(await this.store.labels(b.id)).some((l) => l.id === labelId)) throw new BoardsError("notFound", "Метка не найдена");
    await this.store.updateLabel(labelId, { ...(patch.name !== undefined ? { name: name(patch.name, 40) } : {}), ...(patch.color !== undefined && isBoardColor(patch.color) ? { color: patch.color } : {}) });
    await this.live.boardChanged(b.id);
  }

  async deleteLabel(v: BoardViewer, boardId: string, labelId: string) {
    const b = await this.managed(v, boardId);
    if (!(await this.store.labels(b.id)).some((l) => l.id === labelId)) throw new BoardsError("notFound", "Метка не найдена");
    await this.store.deleteLabel(labelId);
    await this.live.boardChanged(b.id);
  }

  // ─── Участники ───

  async setMember(v: BoardViewer, boardId: string, userId: string, role: "admin" | "member" | null) {
    const b = await this.managed(v, boardId);
    if (role === null) {
      if (userId === b.ownerId) throw new BoardsError("invalid", "Владельца доски нельзя убрать");
      await this.store.removeBoardMember(b.id, userId);
    } else {
      if (!(await this.store.activeStaff([userId])).length) throw new BoardsError("notFound", "Сотрудник не найден");
      await this.store.setBoardMember(b.id, userId, role);
    }
    await this.live.boardChanged(b.id);
  }

  // ─── Правила ───

  private async checkRefs(boardId: string, rule: ReturnType<typeof validateRule>) {
    const [cols, labels] = await Promise.all([this.store.columns(boardId), this.store.labels(boardId)]);
    const colIds = new Set(cols.map((c) => c.id));
    const labelIds = new Set(labels.map((l) => l.id));
    const bad = () => new BoardsError("invalid", "Колонка или метка правила — с другой доски");
    if ("columnId" in rule.trigger && rule.trigger.columnId && !colIds.has(rule.trigger.columnId)) throw bad();
    for (const a of rule.actions) {
      if ("columnId" in a && !colIds.has(a.columnId)) throw bad();
      if ("labelId" in a && !labelIds.has(a.labelId)) throw bad();
    }
    const users = rule.actions.flatMap((a) => (a.type === "assign" && a.userId !== "mover" ? [a.userId] : a.type === "watch" ? [a.userId] : a.type === "notify" && a.userId ? [a.userId] : []));
    if (users.length && (await this.store.activeStaff(users)).length !== new Set(users).size) throw new BoardsError("invalid", "Сотрудник в правиле не найден");
  }

  async addRule(v: BoardViewer, boardId: string, input: { name: string; trigger: unknown; actions: unknown }) {
    const b = await this.managed(v, boardId);
    const rule = validateRule(input.trigger, input.actions);
    await this.checkRefs(b.id, rule);
    const rules = await this.store.rules(b.id);
    const id = await this.store.addRule({ boardId: b.id, name: name(input.name, 120), ...rule, position: (rules.at(-1)?.position ?? 0) + 1024, createdById: v.userId });
    await this.live.boardChanged(b.id);
    return id;
  }

  async updateRule(v: BoardViewer, ruleId: string, patch: { name?: string; trigger?: unknown; actions?: unknown; enabled?: boolean }) {
    const r = await this.store.rule(ruleId);
    if (!r) throw new BoardsError("notFound", "Правило не найдено");
    await this.managed(v, r.boardId);
    const next: Parameters<BoardsStore["updateRule"]>[1] = {};
    if (patch.name !== undefined) next.name = name(patch.name, 120);
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    if (patch.trigger !== undefined || patch.actions !== undefined) {
      const rule = validateRule(patch.trigger ?? r.trigger, patch.actions ?? r.actions);
      await this.checkRefs(r.boardId, rule);
      next.trigger = rule.trigger;
      next.actions = rule.actions;
    }
    await this.store.updateRule(r.id, next);
    await this.live.boardChanged(r.boardId);
  }

  async deleteRule(v: BoardViewer, ruleId: string) {
    const r = await this.store.rule(ruleId);
    if (!r) throw new BoardsError("notFound", "Правило не найдено");
    await this.managed(v, r.boardId);
    await this.store.deleteRule(r.id);
    await this.live.boardChanged(r.boardId);
  }

  // ─── Сохранённые фильтры ───

  async views(v: BoardViewer, boardId: string | null) {
    return (await this.store.views(v.userId, boardId)).map((x) => ({ id: x.id, name: x.name, query: x.query, shared: x.shared, mine: x.userId === v.userId }));
  }

  async saveView(v: BoardViewer, input: { boardId: string | null; name: string; query: string; shared?: boolean }) {
    if (input.boardId) await this.visible(v, input.boardId);
    const query = input.query.replace(/^\?/, "").slice(0, 1000);
    return this.store.addView({ userId: v.userId, boardId: input.boardId, name: name(input.name, 60), query, shared: !!input.shared && v.manageBoards });
  }

  async deleteView(v: BoardViewer, id: string) {
    const x = await this.store.view(id);
    if (!x) throw new BoardsError("notFound", "Фильтр не найден");
    if (x.userId !== v.userId && !v.manageBoards) throw new BoardsError("forbidden");
    await this.store.deleteView(x.id);
  }
}

function wip(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(999, Math.floor(n));
}
