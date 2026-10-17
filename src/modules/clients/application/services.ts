import type { Clock } from "@/shared/application";
import { findMentions } from "@/shared/domain/mentions";
import { ClientsError } from "../domain/errors";
import { canManageTask, extraPhones, isDeletableNote, normalizeTags, taskDue, type TaskKind } from "../domain";
import type { ClientProfile, ClientRepository, CrmLinks, NoteRepository, StaffDirectory, StaffNotifier, TaskRepository } from "./ports";

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
  ) {}

  async create(actor: Actor, input: { title: string; kind: TaskKind; dueAt?: string; clientId?: string; orderId?: string; dealId?: string; assigneeId?: string }) {
    let clientId = input.clientId ?? null;
    if (!clientId && input.orderId) clientId = await this.links.clientOfOrder(input.orderId);
    if (!clientId && input.dealId) clientId = await this.links.clientOfDeal(input.dealId);
    const assigneeId = input.assigneeId ?? actor.userId;
    // «Только свои» ставит задачи себе; назначать другим — роли с видимостью «все».
    if (assigneeId !== actor.userId && !actor.seesAll) throw new ClientsError("forbidden");
    // Исполнитель — действующий сотрудник, как у ответственного клиента (setManager); отключённому задачу не ставим (B12).
    if (assigneeId !== actor.userId && !(await this.staff.isActiveStaff(assigneeId))) throw new ClientsError("staffNotFound", "Сотрудник не найден");
    await this.tasks.add({ title: input.title, kind: input.kind, dueAt: taskDue(input.dueAt), clientId, orderId: input.orderId ?? null, dealId: input.dealId ?? null, assigneeId, createdById: actor.userId });
    if (assigneeId !== actor.userId) {
      const link = input.dealId ? `/admin/deals/${input.dealId}` : input.orderId ? `/admin/orders/${input.orderId}` : "/admin/tasks";
      await this.notifier.notify([assigneeId], { kind: "task", title: `Новая задача: ${input.title}`, body: `Поставил(а) ${actor.name}`, link });
    }
    return { clientId };
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
}

/** Заметки менеджеров в карточке клиента, заказа и сделки; @упоминания уведомляют коллег. */
export class NotesService {
  constructor(
    private readonly notes: NoteRepository,
    private readonly staff: StaffDirectory,
    private readonly notifier: StaffNotifier,
  ) {}

  async add(actor: Actor, input: { kind: "note" | "call" | "message" | "email"; text: string; clientId?: string; orderId?: string; dealId?: string }) {
    await this.notes.add({ kind: input.kind, text: input.text, clientId: input.clientId ?? null, orderId: input.orderId ?? null, dealId: input.dealId ?? null, authorId: actor.userId });
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
