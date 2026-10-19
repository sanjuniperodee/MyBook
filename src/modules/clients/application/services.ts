import type { Clock, WorkSchedule } from "@/shared/application";
import { findMentions } from "@/shared/domain/mentions";
import { ClientsError } from "../domain/errors";
import { canManageTask, extraPhones, isDeletableNote, normalizeTags, snoozedDue, taskDue, type TaskKind, type TaskSnooze } from "../domain";
import { zonedParts } from "@/shared/domain/time";
import type { ClientProfile, ClientRepository, CrmLinks, DealContacts, NoteRepository, StaffDirectory, StaffMessenger, StaffNotifier, TaskRepository } from "./ports";

/** Напоминание о задаче со сроком по умолчанию — за час. */
export const DEFAULT_REMIND_MIN = 60;
/** Напоминание, опоздавшее больше чем на столько минут (сервер лежал), уже не шлём: срок прошёл. */
const REMIND_STALE_MIN = 60;
/** Сколько напоминаний забирает один минутный проход (остальные — в следующем). */
const REMIND_BATCH = 200;
/** Итог задачи «ответить», закрытой ответом клиенту из CRM или с телефона магазина. */
export const ANSWERED_RESULT = "ответили в чате";

const pad = (n: number) => String(n).padStart(2, "0");

/** «через 15 мин», «через 1 ч», «через 1 дн». */
function leadLabel(min: number) {
  if (min < 60) return `${Math.max(1, min)} мин`;
  if (min < 24 * 60) return `${Math.round(min / 60)} ч`;
  return `${Math.round(min / 1440)} дн`;
}

/** Кто действует и что ему разрешено (из контекста Access). */
export interface Actor {
  userId: string;
  name: string;
  /** Видит всех клиентов и сделки (роль без ограничения «только свои»). */
  seesAll: boolean;
  allTasks: boolean;
}



/** CRM-профиль клиента: ответственный, дополнительные телефоны, свои поля, теги. */
export class ClientsService {
  constructor(
    private readonly clients: ClientRepository,
    private readonly staff: StaffDirectory,
  ) {}

  find(id: string) {
    return this.clients.find(id);
  }

  async setManager(client: ClientProfile, managerId: string | null) {
    if (managerId && !(await this.staff.isActiveStaff(managerId))) throw new ClientsError("staffNotFound", "Сотрудник не найден");
    await this.clients.setManager(client.id, managerId);
  }

  async setExtraPhones(client: ClientProfile, raw: string) {
    const phones = extraPhones(raw, client.phone);
    await this.clients.setExtraPhones(client.id, phones);
    return phones;
  }

  setCustomFields(client: ClientProfile, values: ClientProfile["customFields"]) {
    return this.clients.setCustomFields(client.id, values);
  }

  /** Канал привлечения: менеджер указал, откуда пришёл клиент. */
  setSource(clientId: string, source: Record<string, string> | null) {
    return this.clients.setSource(clientId, source);
  }

  async setTags(clientId: string, tags: string[]) {
    const clean = normalizeTags(tags);
    await this.clients.setTags(clientId, clean);
    return clean;
  }
}

/** Задачи менеджеров. */
export class TasksService {
  constructor(
    private readonly tasks: TaskRepository,
    private readonly links: CrmLinks,
    private readonly notifier: StaffNotifier,
    private readonly clock: Clock,
    private readonly staff: StaffDirectory,
    private readonly messenger: StaffMessenger | null = null,
    /** График работы: в WhatsApp сотруднику напоминание уходит только в рабочее время. null — всегда. */
    private readonly schedule: Pick<WorkSchedule, "isWorkTime"> | null = null,
  ) {}

  /** remindBeforeMin: undefined — по умолчанию (за час, если есть срок), null — не напоминать. */
  async create(actor: Actor, input: { title: string; kind: TaskKind; dueAt?: string; remindBeforeMin?: number | null; clientId?: string; orderId?: string; dealId?: string; assigneeId?: string }) {
    let clientId = input.clientId ?? null;
    if (!clientId && input.orderId) clientId = await this.links.clientOfOrder(input.orderId);
    if (!clientId && input.dealId) clientId = await this.links.clientOfDeal(input.dealId);
    const assigneeId = input.assigneeId ?? actor.userId;
    // «Только свои» ставит задачи себе; назначать другим — роли с видимостью «все».
    if (assigneeId !== actor.userId && !actor.seesAll) throw new ClientsError("forbidden");
    // Исполнитель — действующий сотрудник, как у ответственного клиента (setManager); отключённому задачу не ставим (B12).
    if (assigneeId !== actor.userId && !(await this.staff.isActiveStaff(assigneeId))) throw new ClientsError("staffNotFound", "Сотрудник не найден");
    const dueAt = taskDue(input.dueAt);
    const remindBeforeMin = dueAt ? (input.remindBeforeMin === undefined ? DEFAULT_REMIND_MIN : input.remindBeforeMin) : null;
    await this.tasks.add({ title: input.title, kind: input.kind, dueAt, remindBeforeMin, clientId, orderId: input.orderId ?? null, dealId: input.dealId ?? null, assigneeId, createdById: actor.userId });
    if (assigneeId !== actor.userId) {
      const link = input.dealId ? `/admin/deals/${input.dealId}` : input.orderId ? `/admin/orders/${input.orderId}` : "/admin/tasks";
      await this.notifier.notify([assigneeId], { kind: "task", title: `Новая задача: ${input.title}`, body: `Поставил(а) ${actor.name}`, link });
    }
    return { clientId };
  }

  /**
   * Задача от CRM — бота, правила автоматизации, заявки «Перезвоните мне», денег по заказу: автора нет (createdById
   * null), ответственного может не быть (ничья — видят все, напоминание — всем с deals.view). Ответственный отключён —
   * задача ничья. Напоминание по умолчанию — за час до срока; если до срока меньше часа — в сам срок (иначе оно пришло бы
   * сразу вслед за уведомлением о задаче, а срок прошёл бы молча). Уведомление о новой задаче шлёт тот, кто её ставит.
   * once — одна открытая задача с этим заголовком на сделку: повтор события или прохода её не дублирует. false — не
   * поставлена (такая уже есть).
   */
  async createSystem(input: { title: string; kind: TaskKind; dueAt: Date | null; clientId?: string | null; orderId?: string | null; dealId?: string | null; assigneeId: string | null; once?: boolean }): Promise<boolean> {
    if (input.once && input.dealId && (await this.tasks.existsOpen({ dealId: input.dealId, title: input.title }))) return false;
    let clientId = input.clientId ?? null;
    if (!clientId && input.orderId) clientId = await this.links.clientOfOrder(input.orderId);
    if (!clientId && input.dealId) clientId = await this.links.clientOfDeal(input.dealId);
    const assigneeId = input.assigneeId && (await this.staff.isActiveStaff(input.assigneeId)) ? input.assigneeId : null;
    const lead = input.dueAt ? (input.dueAt.getTime() - this.clock.now().getTime()) / 60_000 : 0;
    const remindBeforeMin = input.dueAt ? (lead > DEFAULT_REMIND_MIN ? DEFAULT_REMIND_MIN : 0) : null;
    await this.tasks.add({ title: input.title.slice(0, 200), kind: input.kind, dueAt: input.dueAt, remindBeforeMin, clientId, orderId: input.orderId ?? null, dealId: input.dealId ?? null, assigneeId, createdById: null });
    return true;
  }

  /**
   * Напоминания, время которых пришло: ответственному — уведомление в CRM (со звуком, kind «reminder») и, в рабочее
   * время, сообщение в его WhatsApp (ночью — только в CRM: сотрудника не будим); ничья задача — уведомление в CRM всем,
   * кто видит сделки (в WhatsApp — никому). Каждое уходит один раз (задачу забирает claimDueReminders). Сбой WhatsApp
   * не отменяет уведомление в CRM.
   */
  async remindDue(): Promise<number> {
    const now = this.clock.now();
    const due = await this.tasks.claimDueReminders(now, REMIND_STALE_MIN, REMIND_BATCH);
    const whatsapp = !!this.messenger && due.some((t) => t.assigneeId) && (!this.schedule || (await this.schedule.isWorkTime(now).catch(() => false)));
    for (const t of due) {
      const link = t.dealId ? `/admin/deals/${t.dealId}` : t.orderId ? `/admin/orders/${t.orderId}` : "/admin/tasks";
      const left = Math.max(0, Math.round((t.dueAt.getTime() - now.getTime()) / 60_000));
      const p = zonedParts(t.dueAt);
      const when = `${pad(p.d)}.${pad(p.m)} ${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}`;
      const title = left < 1 ? `Срок задачи наступил: ${t.title}` : `Через ${leadLabel(left)} срок задачи: ${t.title}`;
      if (!t.assigneeId) {
        await this.notifier.dealsTeam({ kind: "reminder", title, body: `Срок: ${when} · задача ничья — возьмите её`, link }).catch(() => {});
        continue;
      }
      await this.notifier.notify([t.assigneeId], { kind: "reminder", title, body: `Срок: ${when}`, link }).catch(() => {});
      if (whatsapp) await this.messenger?.send(t.assigneeId, `⏰ ${title}\nСрок: ${when}\n${link}`).catch(() => false);
    }
    return due.length;
  }

  /**
   * Служебная задача CRM (оплата по счёту, доступ, истёкший счёт): одна открытая на сделку с этим заголовком — повтор
   * события или прохода планировщика её не дублирует. false — такая задача уже есть.
   */
  async createOnce(actor: Actor, input: { title: string; kind: TaskKind; dueAt?: string; clientId?: string; dealId: string; assigneeId?: string }): Promise<boolean> {
    if (await this.tasks.existsOpen({ dealId: input.dealId, title: input.title })) return false;
    await this.create(actor, input);
    return true;
  }

  /**
   * Задачи идут за сделкой: сменился ответственный (вручную, круг, ответ с телефона магазина) — открытые задачи сделки,
   * что были у прежнего ответственного или ничьи (ночная задача бота), переходят новому, напоминание взводится заново.
   * Отключённому сотруднику задачи не переходят. Сколько задач перешло.
   */
  async followDeal(input: { dealId: string; from: string | null; to: string }): Promise<number> {
    if (input.from === input.to || !(await this.staff.isActiveStaff(input.to))) return 0;
    return this.tasks.reassignOpenOfDeal(input);
  }

  /**
   * Клиенту ответили в чате (из CRM или с телефона магазина): открытые задачи «ответить» (kind message) по сделке
   * сделаны — итог «ответили в чате» (automation-12). Звонки и прочие задачи остаются. Сколько закрыто.
   */
  closeAnswered(dealId: string) {
    return this.tasks.closeOpenOfKind({ dealId, kind: "message", result: ANSWERED_RESULT, at: this.clock.now() });
  }

  /** Служебные задачи CRM устарели (остаток оплачен или изменился): прежние открытые закрываются. */
  closeOpenByPrefix(input: { dealId: string; prefix: string; keepTitle?: string | null }) {
    return this.tasks.closeOpenByPrefix({ ...input, at: new Date() });
  }

  private async load(actor: Actor, taskId: string) {
    const t = await this.tasks.find(taskId);
    if (t && !canManageTask({ userId: actor.userId, allTasks: actor.allTasks }, t)) throw new ClientsError("forbidden");
    return t;
  }

  async toggle(actor: Actor, taskId: string) {
    const t = await this.load(actor, taskId);
    if (!t) throw new ClientsError("taskNotFound", "Задача не найдена");
    await this.tasks.setDone(t.id, t.doneAt ? null : this.clock.now());
    return t;
  }

  async delete(actor: Actor, taskId: string) {
    const t = await this.load(actor, taskId);
    if (t) await this.tasks.delete(t.id);
    return t;
  }

  /**
   * Отложить задачу одной кнопкой: «+1 ч» или «Завтра» (snoozedDue). Права — как у правки. Напоминание придёт заново:
   * если до нового срока меньше, чем «напомнить за», — в сам срок (иначе пришло бы сразу); «не напоминать» остаётся.
   * У задачи без срока — напоминание по умолчанию. Выполненная задача не меняется.
   */
  async snooze(actor: Actor, taskId: string, by: TaskSnooze) {
    const t = await this.load(actor, taskId);
    if (!t) throw new ClientsError("taskNotFound", "Задача не найдена");
    if (t.doneAt) return t;
    const now = this.clock.now();
    const dueAt = snoozedDue(t.dueAt, now, by);
    const remind = t.dueAt ? (t.remindBeforeMin ?? null) : DEFAULT_REMIND_MIN;
    const lead = (dueAt.getTime() - now.getTime()) / 60_000;
    await this.tasks.update(t.id, { dueAt, remindBeforeMin: remind === null ? null : lead > remind ? remind : 0 });
    return t;
  }

  /**
   * Правка задачи со страницы «Задачи»: заголовок, тип, срок, напоминание, ответственный, результат. Передать задачу
   * другому — как поставить: роли с видимостью «все»; новому ответственному — уведомление. dueAt: null — без срока.
   */
  async update(
    actor: Actor,
    taskId: string,
    patch: { title?: string; kind?: TaskKind; dueAt?: string | null; remindBeforeMin?: number | null; assigneeId?: string; result?: string | null },
  ) {
    const t = await this.load(actor, taskId);
    if (!t) throw new ClientsError("taskNotFound", "Задача не найдена");
    const next: Parameters<TaskRepository["update"]>[1] = {};
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.kind !== undefined) next.kind = patch.kind;
    if (patch.result !== undefined) next.result = patch.result?.trim() || null;
    if (patch.dueAt !== undefined) {
      next.dueAt = taskDue(patch.dueAt ?? undefined);
      // Срок появился — напоминание по умолчанию (за час), если его не задали явно; срок убрали — напоминать не о чем.
      if (patch.remindBeforeMin === undefined) next.remindBeforeMin = next.dueAt ? (t.dueAt ? undefined : DEFAULT_REMIND_MIN) : null;
      if (next.remindBeforeMin === undefined) delete next.remindBeforeMin;
    }
    if (patch.remindBeforeMin !== undefined) next.remindBeforeMin = patch.remindBeforeMin;
    if (patch.assigneeId !== undefined && patch.assigneeId !== t.assigneeId) {
      if (patch.assigneeId !== actor.userId && !actor.seesAll) throw new ClientsError("forbidden");
      if (!(await this.staff.isActiveStaff(patch.assigneeId))) throw new ClientsError("staffNotFound", "Сотрудник не найден");
      next.assigneeId = patch.assigneeId;
    }
    if (!Object.keys(next).length) return t;
    await this.tasks.update(t.id, next);
    if (next.assigneeId && next.assigneeId !== actor.userId) {
      const link = t.dealId ? `/admin/deals/${t.dealId}` : t.orderId ? `/admin/orders/${t.orderId}` : "/admin/tasks";
      await this.notifier.notify([next.assigneeId], { kind: "task", title: `Вам передали задачу: ${next.title ?? t.title}`, body: `Передал(а) ${actor.name}`, link });
    }
    return t;
  }
}

const CONTACT_NOTE_LABELS = { call: "записан звонок", message: "записано сообщение", email: "записано письмо" } as const;

/** Заметки менеджеров в карточке клиента, заказа и сделки; @упоминания уведомляют коллег; запись о контакте принимает заявку. */
export class NotesService {
  constructor(
    private readonly notes: NoteRepository,
    private readonly staff: StaffDirectory,
    private readonly notifier: StaffNotifier,
    private readonly deals: DealContacts | null = null,
  ) {}

  async add(actor: Actor, input: { kind: "note" | "call" | "message" | "email"; text: string; clientId?: string; orderId?: string; dealId?: string }) {
    await this.notes.add({ kind: input.kind, text: input.text, clientId: input.clientId ?? null, orderId: input.orderId ?? null, dealId: input.dealId ?? null, authorId: actor.userId });
    // Записал звонок, сообщение или письмо в сделке — связался с клиентом: заявка принята в работу (как ответ в чате).
    if (input.dealId && input.kind !== "note") await this.deals?.accept(input.dealId, actor.userId, CONTACT_NOTE_LABELS[input.kind]);
    if (!input.text.includes("@")) return;
    // Ссылка — на то, к чему заметка; без привязки — без ссылки, а не /admin/clients/undefined (B12).
    const link = input.dealId ? `/admin/deals/${input.dealId}` : input.orderId ? `/admin/orders/${input.orderId}` : input.clientId ? `/admin/clients/${input.clientId}` : null;
    const ids = findMentions(input.text, await this.staff.mentionable()).filter((id) => id !== actor.userId);
    const where = input.dealId ? "заметка в сделке" : input.orderId ? "заметка к заказу" : "заметка о клиенте";
    if (ids.length) await this.notifier.notify(ids, { kind: "mention", title: `${actor.name} упомянул(а) вас · ${where}`, body: input.text.slice(0, 300), link });
  }

  /**
   * Запись CRM в ленте сделки (без автора, не удаляется): оплата по счёту, условия, доступ клиента. Одна с таким
   * текстом на сделку — повтор события или прохода её не дублирует. false — уже есть.
   */
  async addSystemOnce(input: { text: string; dealId: string; clientId?: string | null }): Promise<boolean> {
    if (await this.notes.exists({ dealId: input.dealId, text: input.text })) return false;
    await this.notes.add({ kind: "system", text: input.text, clientId: input.clientId ?? null, orderId: null, dealId: input.dealId, authorId: null });
    return true;
  }

  find(noteId: string) {
    return this.notes.find(noteId);
  }

  async delete(noteId: string) {
    const note = await this.notes.find(noteId);
    if (!note) return null;
    if (!isDeletableNote(note.kind)) throw new ClientsError("forbidden");
    await this.notes.delete(note.id);
    return note;
  }
}
