import type { Clock } from "@/shared/application";
import { BoardsError, buildIcal, canManageBoard, canSeeBoard, effectiveColumn, eventMinutes, type BoardViewer, type IcalEvent } from "../domain";
import { cardAccess } from "./BoardsService";
import type { BoardRow, BoardsStore, CardRow, ColumnRow } from "./ports";
import { cardSummary, type CardSummary } from "./views";

/** Личные ссылки iCal (хранится хеш токена). */
export interface CalendarFeeds {
  active(userId: string): Promise<{ id: string; createdAt: Date; lastUsedAt: Date | null } | null>;
  create(userId: string, tokenHash: string): Promise<void>;
  revokeAll(userId: string, at: Date): Promise<void>;
  /** Сотрудник по хешу токена (действующей ссылки) и отметка «пользовались». */
  use(tokenHash: string, at: Date): Promise<{ userId: string } | null>;
}

/** Зритель по id сотрудника — для ленты iCal (права — как в CRM сейчас, а не при выдаче ссылки). */
export type ViewerOf = (userId: string) => Promise<BoardViewer | null>;

const MAX_RANGE_DAYS = 120;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Buffer.from(buf).toString("hex");
}

/** Календарь карточек (день, неделя, месяц, шкала) и личная iCal-ссылка. */
export class CalendarService {
  constructor(
    private readonly store: BoardsStore,
    private readonly feeds: CalendarFeeds,
    private readonly viewerOf: ViewerOf,
    private readonly clock: Clock,
    private readonly appUrl: string,
  ) {}

  /** Карточки со сроком или началом в периоде: на доске boardId или на всех видимых досках (mine — только мои). */
  async range(v: BoardViewer, from: Date, to: Date, opts: { boardId?: string | null; mine?: boolean } = {}): Promise<CardSummary[]> {
    if (!(from < to) || to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) throw new BoardsError("invalid", "Слишком длинный период");
    const boards = (await this.store.boards(v.userId)).filter((b) => canSeeBoard(v, b) && (!opts.boardId || b.id === opts.boardId));
    if (opts.boardId && !boards.length) throw new BoardsError("notFound", "Доска не найдена");
    const byId = new Map<string, BoardRow>(boards.map((b) => [b.id, b]));
    const def = boards.find((b) => b.isDefault) ?? null;
    const rows = await this.store.cardsInRange(from, to, { boardIds: boards.map((b) => b.id), includeDefaultNull: !!def, userId: opts.mine ? v.userId : null });
    const cols = new Map<string, ColumnRow[]>();
    for (const b of boards) cols.set(b.id, await this.store.columns(b.id));
    const out: CardSummary[] = [];
    for (const c of rows) {
      const b = c.boardId ? byId.get(c.boardId) : def;
      if (!b) continue;
      const a = cardAccess(v, c, canManageBoard(v, b));
      if (!a.see) continue;
      out.push({ ...cardSummary(c, effectiveColumn(cols.get(b.id) ?? [], c.columnId, !!c.doneAt), a.edit), boardId: b.id });
    }
    return out;
  }

  // ─── iCal ───

  async feedStatus(v: BoardViewer) {
    const f = await this.feeds.active(v.userId);
    return f ? { active: true, createdAt: f.createdAt.toISOString(), lastUsedAt: f.lastUsedAt?.toISOString() ?? null } : { active: false, createdAt: null, lastUsedAt: null };
  }

  /** Новая ссылка (прежние перестают работать). Ссылку показываем один раз — храним только хеш. */
  async issueFeed(v: BoardViewer): Promise<string> {
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
    await this.feeds.revokeAll(v.userId, this.clock.now());
    await this.feeds.create(v.userId, await sha256(token));
    return `${this.appUrl}/api/calendar/${token}.ics`;
  }

  revokeFeed(v: BoardViewer) {
    return this.feeds.revokeAll(v.userId, this.clock.now());
  }

  /**
   * Лента iCal по токену: мои карточки (исполнитель, соисполнитель, наблюдатель) со сроком — 60 дней назад и 180
   * вперёд. В событии — только название и ссылка на карточку. null — ссылка отозвана или сотрудник отключён.
   */
  async feed(token: string): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
    const now = this.clock.now();
    const f = await this.feeds.use(await sha256(token), now);
    if (!f) return null;
    const v = await this.viewerOf(f.userId);
    if (!v) return null;
    const from = new Date(now.getTime() - 60 * 86_400_000);
    const to = new Date(now.getTime() + 180 * 86_400_000);
    const boards = (await this.store.boards(v.userId)).filter((b) => canSeeBoard(v, b));
    const def = boards.find((b) => b.isDefault) ?? null;
    const rows: CardRow[] = await this.store.cardsInRange(from, to, { boardIds: boards.map((b) => b.id), includeDefaultNull: !!def, userId: v.userId });
    const events: IcalEvent[] = rows
      .filter((c) => (c.dueAt || c.startAt) && (c.assigneeId === v.userId || c.members.some((m) => m.userId === v.userId)))
      .map((c) => icalEvent(c, this.appUrl));
    return buildIcal("MyBooks CRM", events, now);
  }
}

/** Событие календаря для карточки: срок «к 18:00» без явного времени — днём; иначе — по длительности типа. */
export function icalEvent(c: Pick<CardRow, "id" | "title" | "dueAt" | "startAt" | "doneAt" | "updatedAt"> & { kind: string }, appUrl: string): IcalEvent {
  const due = c.dueAt ?? c.startAt!;
  const start = c.startAt && c.startAt < due ? c.startAt : new Date(due.getTime() - eventMinutes(c.kind) * 60_000);
  const allDay = !c.startAt && due.getHours() === 18 && due.getMinutes() === 0;
  return { uid: `task-${c.id}@mybooks.kz`, title: c.title.replace(/\s*\(бот\)\s*$/, ""), url: `${appUrl}/admin/tasks/${c.id}`, start: allDay ? due : start, end: due, allDay, done: !!c.doneAt, updatedAt: c.updatedAt };
}
