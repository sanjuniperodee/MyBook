import {
  ClientsService,
  NotesService,
  TasksService,
  type Actor,
  type ClientProfile,
  type ClientRepository,
  type CrmLinks,
  type Note,
  type NoteRepository,
  type StaffDirectory,
  type StaffNotifier,
  type TaskRepository,
} from "@/modules/clients/application";
import type { Task } from "@/modules/clients/domain";
import { clock } from "./ordering";

// ─── тестовые двойники ─────────────────────────────────────────────────────

/** Профили клиентов; доп. телефоны и теги — отдельно, как колонки users. Нет строки — запись ничего не меняет (UPDATE … WHERE id). */
class MemClients implements ClientRepository {
  rows = new Map<string, ClientProfile>();
  extraPhones = new Map<string, string[]>();
  tags = new Map<string, string[]>();
  async find(id: string) {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }
  private patch(id: string, p: Partial<ClientProfile>) {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, ...p });
  }
  async setManager(id: string, managerId: string | null) {
    this.patch(id, { managerId });
  }
  async setCustomFields(id: string, customFields: ClientProfile["customFields"]) {
    this.patch(id, { customFields });
  }
  async setSource(id: string, source: Record<string, string> | null) {
    this.patch(id, { source });
  }
  async setExtraPhones(id: string, phones: string[]) {
    if (this.rows.has(id)) this.extraPhones.set(id, phones);
  }
  async setTags(id: string, tags: string[]) {
    if (this.rows.has(id)) this.tags.set(id, tags);
  }
}

class MemTasks implements TaskRepository {
  rows = new Map<string, Task & { remindBeforeMin?: number | null; remindedAt?: Date | null }>();
  private seq = 0;
  async find(id: string) {
    const t = this.rows.get(id);
    return t ? { ...t } : null;
  }
  async add(t: Parameters<TaskRepository["add"]>[0]) {
    const id = `task-${++this.seq}`;
    this.rows.set(id, { id, doneAt: null, ...t });
  }
  async claimDueReminders(now: Date, staleMin: number, limit: number) {
    const out: Awaited<ReturnType<TaskRepository["claimDueReminders"]>> = [];
    const open = [...this.rows].filter(([, t]) => !t.doneAt && !t.remindedAt && t.dueAt && t.remindBeforeMin != null).sort(([, a], [, b]) => a.dueAt!.getTime() - b.dueAt!.getTime());
    for (const [id, t] of open) {
      if (out.length >= limit) break;
      if (t.dueAt!.getTime() - t.remindBeforeMin! * 60_000 > now.getTime() || t.dueAt!.getTime() <= now.getTime() - staleMin * 60_000) continue;
      this.rows.set(id, { ...t, remindedAt: now });
      out.push({ id, title: t.title, kind: t.kind, dueAt: t.dueAt!, assigneeId: t.assigneeId, dealId: t.dealId, orderId: t.orderId });
    }
    return out;
  }
  async existsOpen({ dealId, title }: { dealId: string; title: string }) {
    return [...this.rows.values()].some((t) => t.dealId === dealId && t.title === title && !t.doneAt);
  }
  async closeOpenByPrefix({ dealId, prefix, keepTitle, at }: { dealId: string; prefix: string; keepTitle?: string | null; at: Date }) {
    let n = 0;
    for (const [id, t] of this.rows) {
      if (t.dealId !== dealId || t.doneAt || !t.title.startsWith(prefix) || t.title === keepTitle) continue;
      this.rows.set(id, { ...t, doneAt: at });
      n++;
    }
    return n;
  }
  async setDone(id: string, doneAt: Date | null) {
    const t = this.rows.get(id);
    if (t) this.rows.set(id, { ...t, doneAt });
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async update(id: string, patch: Parameters<TaskRepository["update"]>[1]) {
    const t = this.rows.get(id);
    if (t) this.rows.set(id, { ...t, ...patch, ...("dueAt" in patch || "remindBeforeMin" in patch ? { remindedAt: null } : {}) });
  }
  /** Готовая задача: по умолчанию ничья и открытая. */
  seed(p: Partial<Task> & { id: string }) {
    this.rows.set(p.id, { title: "Задача", kind: "task", dueAt: null, doneAt: null, clientId: null, orderId: null, dealId: null, assigneeId: null, createdById: null, ...p });
  }
  last() {
    return [...this.rows.values()].at(-1)!;
  }
}

class MemNotes implements NoteRepository {
  rows = new Map<string, Note & { authorId: string | null }>();
  private seq = 0;
  async find(id: string) {
    const n = this.rows.get(id);
    return n ? { id: n.id, kind: n.kind, text: n.text, clientId: n.clientId, orderId: n.orderId, dealId: n.dealId } : null;
  }
  async add(n: Parameters<NoteRepository["add"]>[0]) {
    const id = `note-${++this.seq}`;
    this.rows.set(id, { id, ...n });
  }
  async exists({ dealId, text }: { dealId: string; text: string }) {
    return [...this.rows.values()].some((n) => n.dealId === dealId && n.text === text);
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

/** Справочник сотрудников; checked — кого проверяли на «действующий», lookups — сколько раз брали список для упоминаний. */
class FakeStaff implements StaffDirectory {
  checked: string[] = [];
  lookups = 0;
  constructor(readonly list: { id: string; label: string; active: boolean }[]) {}
  async isActiveStaff(userId: string) {
    this.checked.push(userId);
    return this.list.some((s) => s.id === userId && s.active);
  }
  async mentionable() {
    this.lookups++;
    return this.list.filter((s) => s.active).map(({ id, label }) => ({ id, label }));
  }
}

/** Уведомления: адресатам — userIds, всем с deals.view (ничья задача) — userIds ["deals.view"]. */
class SpyNotifier implements StaffNotifier {
  sent: { userIds: string[]; n: Parameters<StaffNotifier["notify"]>[1] }[] = [];
  async notify(userIds: string[], n: Parameters<StaffNotifier["notify"]>[1]) {
    this.sent.push({ userIds, n });
  }
  async dealsTeam(n: Parameters<StaffNotifier["dealsTeam"]>[0]) {
    this.sent.push({ userIds: ["deals.view"], n });
  }
}

/** Заказ order-1 — клиента client-1, сделка deal-1 — клиента client-2. */
const orderClients: Record<string, string> = { "order-1": "client-1" };
const dealClients: Record<string, string> = { "deal-1": "client-2" };
const links: CrmLinks = {
  clientOfOrder: async (id) => orderClients[id] ?? null,
  clientOfDeal: async (id) => dealClients[id] ?? null,
  dealAssignee: async (id) => (id === "deal-1" ? "m1" : null),
};

/** Менеджер с ограничением «только свои»: задачи ставит себе, чужие не трогает. */
export const manager: Actor = { userId: "m1", name: "Айгерим", seesAll: false, allTasks: false };
/** Старший менеджер: видит всех и ставит задачи другим, но чужие задачи закрывать не может. */
export const lead: Actor = { userId: "m2", name: "Айгерим Сапарова", seesAll: true, allTasks: false };
/** Руководитель: все клиенты и все задачи. */
export const head: Actor = { userId: "h1", name: "Марат", seesAll: true, allTasks: true };

export function setup() {
  const mem = { clients: new MemClients(), tasks: new MemTasks(), notes: new MemNotes() };
  const staff = new FakeStaff([
    { id: "m1", label: "Айгерим", active: true },
    { id: "m2", label: "Айгерим Сапарова", active: true },
    { id: "h1", label: "Марат", active: true },
    { id: "x1", label: "Бывший", active: false },
  ]);
  const notifier = new SpyNotifier();
  const accepted: string[] = [];
  const c = clock();
  mem.clients.rows.set("client-1", { id: "client-1", name: "Айжан", email: "a@b.kz", phone: "+7 701 000 00 00", managerId: null, source: null, customFields: {} });
  return {
    mem,
    staff,
    notifier,
    c,
    clients: new ClientsService(mem.clients, staff),
    tasks: new TasksService(mem.tasks, links, notifier, c, staff),
    notes: new NotesService(mem.notes, staff, notifier, { accept: async (dealId, staffId, how) => void accepted.push(`${dealId}:${staffId}:${how}`) }),
    /** Какие заявки приняты в работу записью о контакте: «сделка:сотрудник:как». */
    accepted,
  };
}
