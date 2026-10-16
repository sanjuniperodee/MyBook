import type { NoteKind, Task, TaskKind } from "../domain";

/** CRM-профиль клиента (поверх учётной записи сайта). */
export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  managerId: string | null;
  /** Откуда пришёл клиент: UTM-метки, реферер или канал, выбранный менеджером. */
  source: Record<string, string> | null;
  customFields: Record<string, string | number | boolean | null>;
}

export interface ClientRepository {
  find(id: string): Promise<ClientProfile | null>;
  setManager(id: string, managerId: string | null): Promise<void>;
  setExtraPhones(id: string, phones: string[]): Promise<void>;
  setCustomFields(id: string, values: ClientProfile["customFields"]): Promise<void>;
  setTags(id: string, tags: string[]): Promise<void>;
  /** Откуда пришёл клиент (метки источника) — JSON как у UTM; null снимает метку. */
  setSource(id: string, source: Record<string, string> | null): Promise<void>;
}

export interface TaskRepository {
  find(id: string): Promise<Task | null>;
  add(t: { title: string; kind: TaskKind; dueAt: Date | null; clientId: string | null; orderId: string | null; dealId: string | null; assigneeId: string; createdById: string }): Promise<void>;
  /** Есть ли открытая задача с таким заголовком по сделке (служебные задачи CRM не дублируются при повторе). */
  existsOpen(t: { dealId: string; title: string }): Promise<boolean>;
  setDone(id: string, doneAt: Date | null): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface Note {
  id: string;
  kind: NoteKind;
  text: string;
  clientId: string | null;
  orderId: string | null;
  dealId: string | null;
}

export interface NoteRepository {
  find(id: string): Promise<Note | null>;
  /** authorId null — запись CRM (оплата, доступ), а не сотрудника. */
  add(n: Omit<Note, "id"> & { authorId: string | null }): Promise<void>;
  /** Есть ли у сделки заметка с таким текстом (служебные заметки CRM пишутся один раз). */
  exists(n: { dealId: string; text: string }): Promise<boolean>;
  delete(id: string): Promise<void>;
}

/** К какому клиенту относится заказ или сделка; кто ответственный за сделку. */
export interface CrmLinks {
  clientOfOrder(orderId: string): Promise<string | null>;
  clientOfDeal(dealId: string): Promise<string | null>;
  dealAssignee(dealId: string): Promise<string | null>;
}

export interface StaffDirectory {
  isActiveStaff(userId: string): Promise<boolean>;
  mentionable(): Promise<{ id: string; label: string }[]>;
}

export interface StaffNotifier {
  notify(userIds: string[], n: { kind: "task" | "mention"; title: string; body: string; link: string | null }): Promise<void>;
}

/** Чем пользовался клиент на сайте: заходил ли, книги, заказы (новый ли это аккаунт). */
export interface AccountUsage {
  lastSeenAt: Date | null;
  books: number;
  orders: number;
}
