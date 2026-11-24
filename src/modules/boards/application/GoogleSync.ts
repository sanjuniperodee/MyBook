import type { Clock } from "@/shared/application";
import { BoardsError, type BoardViewer } from "../domain";
import { icalEvent, type ViewerOf } from "./CalendarService";
import type { BoardsService } from "./BoardsService";
import type { CardsService } from "./CardsService";

// ─── Порты ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webhookUrl: string;
}

export interface GoogleEventInput {
  taskId: string;
  title: string;
  url: string;
  start: Date;
  end: Date;
  allDay: boolean;
  done: boolean;
  remindMin: number | null;
  meet: boolean;
}

export interface GoogleEvent {
  id: string;
  cancelled: boolean;
  title: string;
  start: Date | null;
  end: Date | null;
  allDay: boolean;
  updated: Date | null;
  etag: string | null;
  /** Карточка CRM, из которой событие (extendedProperties); null — событие завели в Google. */
  taskId: string | null;
  meetUrl: string | null;
}

export interface GoogleApi {
  authUrl(cfg: GoogleConfig, state: string): string;
  exchange(cfg: GoogleConfig, code: string): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number; email: string | null; scope: string }>;
  refresh(cfg: GoogleConfig, refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  revoke(token: string): Promise<void>;
  createCalendar(token: string, summary: string): Promise<string>;
  calendarExists(token: string, calendarId: string): Promise<boolean>;
  deleteCalendar(token: string, calendarId: string): Promise<void>;
  upsertEvent(token: string, calendarId: string, eventId: string | null, ev: GoogleEventInput): Promise<GoogleEvent>;
  deleteEvent(token: string, calendarId: string, eventId: string): Promise<void>;
  changes(token: string, calendarId: string, syncToken: string | null): Promise<{ items: GoogleEvent[]; syncToken: string | null; reset: boolean }>;
  watch(token: string, calendarId: string, channel: { id: string; token: string; address: string }): Promise<{ resourceId: string; expiresAt: Date }>;
  stop(token: string, channelId: string, resourceId: string): Promise<void>;
}

export interface GoogleAccount {
  userId: string;
  email: string | null;
  refreshToken: string;
  accessToken: string | null;
  accessExpiresAt: Date | null;
  calendarId: string | null;
  syncToken: string | null;
  channelId: string | null;
  channelToken: string | null;
  resourceId: string | null;
  channelExpiresAt: Date | null;
  pullRequestedAt: Date | null;
  lastPushAt: Date | null;
  lastPullAt: Date | null;
  error: string | null;
}

/** Задача сотрудника для календаря (он исполнитель или соисполнитель, есть срок или начало). */
export interface SyncTask {
  id: string;
  title: string;
  kind: string;
  dueAt: Date | null;
  startAt: Date | null;
  doneAt: Date | null;
  updatedAt: Date;
  remindBeforeMin: number | null;
  meet: boolean;
}

export interface GoogleLink {
  taskId: string;
  eventId: string;
  etag: string | null;
  taskVersion: Date | null;
}

export interface GoogleStore {
  account(userId: string): Promise<GoogleAccount | null>;
  accounts(): Promise<GoogleAccount[]>;
  saveAccount(a: GoogleAccount): Promise<void>;
  updateAccount(userId: string, patch: Partial<Omit<GoogleAccount, "userId">>): Promise<void>;
  deleteAccount(userId: string): Promise<void>;
  byChannel(channelId: string): Promise<{ userId: string; channelToken: string | null } | null>;
  /** Задачи сотрудника со сроком или началом: 30 дней назад — год вперёд, не в архиве. */
  tasksFor(userId: string, from: Date, to: Date): Promise<SyncTask[]>;
  task(taskId: string): Promise<SyncTask | null>;
  links(userId: string): Promise<GoogleLink[]>;
  setLink(l: GoogleLink & { userId: string; meetUrl: string | null }): Promise<void>;
  deleteLink(taskId: string, userId: string): Promise<void>;
}

/** Подпись state OAuth (HMAC на секрете сайта): вход Google вернёт его в callback. */
export interface StateSigner {
  sign(payload: string): string;
  verify(signed: string): string | null;
}

const CALENDAR_NAME = "MyBooks CRM";
/** Удалённое в Google событие помечается так: заново не создаём, пока карточку не поменяют в CRM. */
const DELETED = "deleted:";
const PUSH_BATCH = 60;
/** Без push-уведомлений Google — опрос раз в столько минут. */
const POLL_MIN = 10;

/**
 * Google Календарь сотрудника: вход через Google (OAuth), отдельный календарь «MyBooks CRM», двусторонняя синхронизация
 * задач (CRM → Google — проход планировщика по updated_at карточки; Google → CRM — по push-уведомлению канала watch,
 * а без него — опросом), встречи с Google Meet. В событии — только название и ссылка на карточку. Включает каждый сам.
 */
export class GoogleSync {
  constructor(
    private readonly api: GoogleApi,
    private readonly store: GoogleStore,
    private readonly config: () => Promise<GoogleConfig | null>,
    private readonly signer: StateSigner,
    private readonly cards: CardsService,
    private readonly boards: BoardsService,
    private readonly viewerOf: ViewerOf,
    private readonly clock: Clock,
    private readonly appUrl: string,
  ) {}

  private async cfg() {
    const c = await this.config();
    if (!c) throw new BoardsError("googleNotConfigured", "Google Календарь ещё не подключён к CRM: руководителю нужно ввести ключи Google в настройках");
    return c;
  }

  /** Сколько сотрудников подключили календарь (для настроек). */
  async connectedCount() {
    return (await this.store.accounts()).length;
  }

  async status(v: BoardViewer) {
    const [cfg, a] = await Promise.all([this.config(), this.store.account(v.userId)]);
    return { configured: !!cfg, connected: !!a, email: a?.email ?? null, lastPushAt: a?.lastPushAt?.toISOString() ?? null, lastPullAt: a?.lastPullAt?.toISOString() ?? null, error: a?.error ?? null, push: !!a?.channelId };
  }

  /** Адрес входа в Google: state подписан и живёт 15 минут. */
  async connectUrl(v: BoardViewer) {
    const cfg = await this.cfg();
    const state = this.signer.sign(`${v.userId}.${this.clock.now().getTime() + 15 * 60_000}`);
    return this.api.authUrl(cfg, state);
  }

  /** Возврат из Google: токены, свой календарь, канал уведомлений, первая выгрузка задач. */
  async finish(code: string, state: string): Promise<string> {
    const cfg = await this.cfg();
    const payload = this.signer.verify(state);
    const [userId, exp] = payload?.split(".") ?? [];
    if (!userId || !exp || Number(exp) < this.clock.now().getTime()) throw new BoardsError("invalid", "Ссылка входа устарела — нажмите «Подключить» ещё раз");
    const t = await this.api.exchange(cfg, code).catch((e: Error) => {
      throw new BoardsError("googleFailed", `Google не подтвердил вход: ${e.message}`);
    });
    if (!t.scope.includes("calendar")) throw new BoardsError("invalid", "Не дан доступ к календарю — подключите ещё раз и отметьте галочку календаря");
    const prev = await this.store.account(userId);
    const refreshToken = t.refreshToken ?? prev?.refreshToken;
    if (!refreshToken) throw new BoardsError("googleFailed", "Google не выдал постоянный доступ — отключите MyBooks в настройках аккаунта Google и подключите снова");
    let calendarId = prev?.calendarId ?? null;
    if (calendarId && !(await this.api.calendarExists(t.accessToken, calendarId).catch(() => false))) calendarId = null;
    calendarId ??= await this.api.createCalendar(t.accessToken, CALENDAR_NAME);
    const now = this.clock.now();
    await this.store.saveAccount({
      userId,
      email: t.email ?? prev?.email ?? null,
      refreshToken,
      accessToken: t.accessToken,
      accessExpiresAt: new Date(now.getTime() + (t.expiresIn - 60) * 1000),
      calendarId,
      syncToken: prev?.calendarId === calendarId ? (prev?.syncToken ?? null) : null,
      channelId: prev?.channelId ?? null,
      channelToken: prev?.channelToken ?? null,
      resourceId: prev?.resourceId ?? null,
      channelExpiresAt: prev?.channelExpiresAt ?? null,
      pullRequestedAt: null,
      lastPushAt: null,
      lastPullAt: null,
      error: null,
    });
    await this.syncOne(userId).catch((e) => console.error("[google] первая синхронизация", e));
    return userId;
  }

  async disconnect(v: BoardViewer) {
    const a = await this.store.account(v.userId);
    if (!a) return;
    const cfg = await this.config();
    const token = cfg ? await this.token(cfg, a).catch(() => null) : null;
    if (token) {
      if (a.channelId && a.resourceId) await this.api.stop(token, a.channelId, a.resourceId);
      if (a.calendarId) await this.api.deleteCalendar(token, a.calendarId).catch(() => {});
      await this.api.revoke(a.refreshToken);
    }
    await this.store.deleteAccount(v.userId);
  }

  /** Push-уведомление Google о канале: проверяем токен канала и просим забрать изменения при ближайшем проходе. */
  async notified(channelId: string, channelToken: string | null): Promise<boolean> {
    const a = await this.store.byChannel(channelId);
    if (!a || !a.channelToken || a.channelToken !== channelToken) return false;
    await this.store.updateAccount(a.userId, { pullRequestedAt: this.clock.now() });
    return true;
  }

  /** Проход планировщика: каждый подключённый сотрудник — продлить канал, выгрузить изменения, забрать изменения. */
  async syncAll(): Promise<number> {
    if (!(await this.config())) return 0;
    let n = 0;
    for (const a of await this.store.accounts()) {
      if (a.error?.startsWith("revoked")) continue;
      try {
        n += await this.syncOne(a.userId);
      } catch (e) {
        console.error(`[google] ${a.email ?? a.userId}`, e);
        await this.store.updateAccount(a.userId, { error: e instanceof Error ? e.message.slice(0, 300) : "ошибка синхронизации" });
      }
    }
    return n;
  }

  private async token(cfg: GoogleConfig, a: GoogleAccount): Promise<string> {
    const now = this.clock.now();
    if (a.accessToken && a.accessExpiresAt && a.accessExpiresAt > now) return a.accessToken;
    try {
      const r = await this.api.refresh(cfg, a.refreshToken);
      const exp = new Date(now.getTime() + (r.expiresIn - 60) * 1000);
      await this.store.updateAccount(a.userId, { accessToken: r.accessToken, accessExpiresAt: exp });
      a.accessToken = r.accessToken;
      a.accessExpiresAt = exp;
      return r.accessToken;
    } catch (e) {
      if (e instanceof Error && /invalid_grant/.test(e.message)) await this.store.updateAccount(a.userId, { error: "revoked: доступ к Google отозван — подключите календарь заново" });
      throw e;
    }
  }

  async syncOne(userId: string): Promise<number> {
    const cfg = await this.cfg();
    const a = await this.store.account(userId);
    if (!a) return 0;
    const v = await this.viewerOf(userId);
    if (!v) return 0;
    const token = await this.token(cfg, a);
    const now = this.clock.now();
    const due = !a.lastPullAt || (a.pullRequestedAt && a.pullRequestedAt > a.lastPullAt) || now.getTime() - a.lastPullAt.getTime() > (a.channelId ? 60 : POLL_MIN) * 60_000;
    // Календарь проверяем при опросе (не каждую минуту): удалили в Google — заводим заново и выгружаем всё.
    if (!a.calendarId || (due && !(await this.api.calendarExists(token, a.calendarId)))) {
      a.calendarId = await this.api.createCalendar(token, CALENDAR_NAME);
      a.syncToken = null;
      await this.store.updateAccount(userId, { calendarId: a.calendarId, syncToken: null, channelId: null, resourceId: null, channelExpiresAt: null });
      for (const l of await this.store.links(userId)) await this.store.deleteLink(l.taskId, userId);
    }
    await this.ensureChannel(cfg, a, token);
    const pushed = await this.push(a, token);
    const pulled = due ? await this.pull(a, token, v) : 0;
    await this.store.updateAccount(userId, { lastPushAt: pushed ? now : a.lastPushAt, ...(due ? { lastPullAt: now, pullRequestedAt: null } : {}), error: null });
    return pushed + pulled;
  }

  /** Канал push-уведомлений: нет или истекает в ближайшие сутки — новый. Google не принял адрес — живём опросом. */
  private async ensureChannel(cfg: GoogleConfig, a: GoogleAccount, token: string) {
    const now = this.clock.now();
    if (a.channelId && a.channelExpiresAt && a.channelExpiresAt.getTime() - now.getTime() > 86_400_000) return;
    if (!cfg.webhookUrl.startsWith("https://")) return;
    if (a.channelId && a.resourceId) await this.api.stop(token, a.channelId, a.resourceId);
    const channel = { id: crypto.randomUUID(), token: Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url"), address: cfg.webhookUrl };
    try {
      const w = await this.api.watch(token, a.calendarId!, channel);
      Object.assign(a, { channelId: channel.id, channelToken: channel.token, resourceId: w.resourceId, channelExpiresAt: w.expiresAt });
      await this.store.updateAccount(a.userId, { channelId: channel.id, channelToken: channel.token, resourceId: w.resourceId, channelExpiresAt: w.expiresAt });
    } catch (e) {
      console.warn("[google] канал уведомлений не создан — опрос", e instanceof Error ? e.message : e);
      Object.assign(a, { channelId: null, resourceId: null, channelExpiresAt: null });
      await this.store.updateAccount(a.userId, { channelId: null, channelToken: null, resourceId: null, channelExpiresAt: null });
    }
  }

  private event(t: SyncTask): GoogleEventInput {
    const e = icalEvent(t, this.appUrl);
    return { taskId: t.id, title: e.done ? `✓ ${e.title}` : e.title, url: e.url, start: e.start, end: e.end, allDay: !!e.allDay, done: !!t.doneAt, remindMin: t.remindBeforeMin, meet: t.meet && (t.kind === "meeting" || t.kind === "call") };
  }

  /** CRM → Google: новые и изменённые карточки — событием, переставшие быть «моими» или без даты — удалить. */
  private async push(a: GoogleAccount, token: string): Promise<number> {
    const now = this.clock.now();
    const [tasks, links] = await Promise.all([this.store.tasksFor(a.userId, new Date(now.getTime() - 30 * 86_400_000), new Date(now.getTime() + 365 * 86_400_000)), this.store.links(a.userId)]);
    const byTask = new Map(links.map((l) => [l.taskId, l]));
    const mine = new Set(tasks.map((t) => t.id));
    let n = 0;
    for (const t of tasks) {
      if (n >= PUSH_BATCH) break;
      const l = byTask.get(t.id);
      if (l && l.taskVersion && t.updatedAt.getTime() <= l.taskVersion.getTime()) continue;
      const eventId = l && !l.eventId.startsWith(DELETED) ? l.eventId : null;
      const ev = await this.api.upsertEvent(token, a.calendarId!, eventId, this.event(t));
      await this.store.setLink({ taskId: t.id, userId: a.userId, eventId: ev.id, etag: ev.etag, taskVersion: t.updatedAt, meetUrl: ev.meetUrl });
      n++;
    }
    for (const l of links) {
      if (mine.has(l.taskId)) continue;
      if (!l.eventId.startsWith(DELETED)) await this.api.deleteEvent(token, a.calendarId!, l.eventId);
      await this.store.deleteLink(l.taskId, a.userId);
      n++;
    }
    return n;
  }

  /** Google → CRM: перенесли или переименовали событие — меняется карточка; удалили — не восстанавливаем; новое событие — карточка на личной доске. */
  private async pull(a: GoogleAccount, token: string, v: BoardViewer): Promise<number> {
    let r = await this.api.changes(token, a.calendarId!, a.syncToken);
    if (r.reset) r = await this.api.changes(token, a.calendarId!, null);
    const links = await this.store.links(a.userId);
    const byEvent = new Map(links.map((l) => [l.eventId, l]));
    let n = 0;
    for (const ev of r.items) {
      try {
        if (await this.applyEvent(a, token, v, ev, byEvent.get(ev.id) ?? null)) n++;
      } catch (e) {
        console.warn("[google] событие не применено", ev.id, e instanceof Error ? e.message : e);
      }
    }
    await this.store.updateAccount(a.userId, { syncToken: r.syncToken });
    return n;
  }

  private async applyEvent(a: GoogleAccount, token: string, v: BoardViewer, ev: GoogleEvent, link: GoogleLink | null): Promise<boolean> {
    const taskId = ev.taskId ?? link?.taskId ?? null;
    if (!taskId) {
      if (ev.cancelled || !ev.start) return false;
      // Событие завели в календаре «MyBooks CRM» — карточка на личной доске сотрудника.
      const boardId = await this.personalBoard(v);
      const { due, start } = this.datesOf(ev);
      const id = await this.cards.create(v, { boardId, title: ev.title.trim() || "Без названия", dueAt: due?.toISOString() ?? null, startAt: start?.toISOString() ?? null, assigneeIds: [v.userId] });
      const t = await this.store.task(id);
      if (!t) return false;
      const saved = await this.api.upsertEvent(token, a.calendarId!, ev.id, this.event(t));
      await this.store.setLink({ taskId: id, userId: a.userId, eventId: saved.id, etag: saved.etag, taskVersion: t.updatedAt, meetUrl: saved.meetUrl });
      return true;
    }
    const task = await this.store.task(taskId);
    if (!task) {
      // Карточку удалили в CRM — событие-сирота.
      if (!ev.cancelled) await this.api.deleteEvent(token, a.calendarId!, ev.id);
      return false;
    }
    if (ev.cancelled) {
      await this.store.setLink({ taskId, userId: a.userId, eventId: `${DELETED}${ev.id}`, etag: null, taskVersion: task.updatedAt, meetUrl: null });
      return false;
    }
    if (link && link.etag && ev.etag === link.etag) return false;
    const { due, start } = this.datesOf(ev);
    const title = ev.title.replace(/^✓\s*/, "").trim();
    const patch: { title?: string; dueAt?: string | null; startAt?: string | null } = {};
    if (title && title !== task.title.replace(/\s*\(бот\)\s*$/, "")) patch.title = title;
    if (due && (!task.dueAt || Math.abs(due.getTime() - task.dueAt.getTime()) >= 60_000)) patch.dueAt = due.toISOString();
    if ((start?.getTime() ?? null) !== (task.startAt?.getTime() ?? null) && (start || task.startAt)) patch.startAt = start?.toISOString() ?? null;
    if (Object.keys(patch).length) await this.cards.update(v, taskId, patch);
    const after = (await this.store.task(taskId)) ?? task;
    await this.store.setLink({ taskId, userId: a.userId, eventId: ev.id, etag: ev.etag, taskVersion: after.updatedAt, meetUrl: ev.meetUrl });
    return Object.keys(patch).length > 0;
  }

  /** Срок и начало из события: весь день — срок к 18:00 этого дня; иначе срок — конец, начало — если длиннее обычного. */
  private datesOf(ev: GoogleEvent): { due: Date | null; start: Date | null } {
    if (!ev.start) return { due: null, start: null };
    if (ev.allDay) {
      const d = new Date(ev.start);
      const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(d);
      return { due: new Date(`${local}T18:00:00+05:00`), start: null };
    }
    const end = ev.end ?? ev.start;
    const minutes = (end.getTime() - ev.start.getTime()) / 60_000;
    return { due: end, start: minutes > 60 ? ev.start : null };
  }

  private async personalBoard(v: BoardViewer): Promise<string> {
    const mine = (await this.boards.list(v)).find((b) => b.kind === "personal" && b.ownerId === v.userId);
    return mine?.id ?? (await this.boards.create(v, { name: "Мои дела", template: "personal" }));
  }
}
