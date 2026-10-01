import type { NoteKind, Task, TaskKind } from "../domain";

/** CRM-профиль клиента (поверх учётной записи сайта). */
export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  managerId: string | null;
  customFields: Record<string, string | number | boolean | null>;
}

export interface ClientRepository {
  find(id: string): Promise<ClientProfile | null>;
  setManager(id: string, managerId: string | null): Promise<void>;
  setExtraPhones(id: string, phones: string[]): Promise<void>;
  setCustomFields(id: string, values: ClientProfile["customFields"]): Promise<void>;
  setTags(id: string, tags: string[]): Promise<void>;
}

export interface TaskRepository {
  find(id: string): Promise<Task | null>;
  add(t: { title: string; kind: TaskKind; dueAt: Date | null; clientId: string | null; orderId: string | null; dealId: string | null; assigneeId: string; createdById: string }): Promise<void>;
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
  add(n: Omit<Note, "id"> & { authorId: string }): Promise<void>;
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
  notify(userIds: string[], n: { kind: "task" | "mention"; title: string; body: string; link: string }): Promise<void>;
}
