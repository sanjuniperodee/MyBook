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
  /** assigneeId null — ничья задача (её видят все); createdById null — поставила CRM (бот, правило, заявка с сайта). */
  add(t: { title: string; kind: TaskKind; dueAt: Date | null; clientId: string | null; orderId: string | null; dealId: string | null; assigneeId: string | null; createdById: string | null; remindBeforeMin: number | null }): Promise<void>;
  /**
   * Забрать напоминания, время которых пришло (открытая задача со сроком, напоминание ещё не уходило): помечает их
   * отправленными, поэтому параллельный проход не продублирует. Задачи, просроченные больше чем на staleMin, пропускаются.
   * Ничьи задачи — тоже (assigneeId null). Не больше limit за раз, самые ранние сроки первыми. dueBefore — только задачи
   * со сроком раньше него (вне смены: остальные не забираются и дождутся её начала).
   */
  claimDueReminders(now: Date, staleMin: number, limit: number, dueBefore?: Date | null): Promise<{ id: string; title: string; kind: TaskKind; dueAt: Date; assigneeId: string | null; dealId: string | null; orderId: string | null }[]>;
  /** Есть ли открытая задача с таким заголовком по сделке (служебные задачи CRM не дублируются при повторе). */
  existsOpen(t: { dealId: string; title: string }): Promise<boolean>;
  /**
   * Закрыть открытые задачи сделки этого типа, поставленные CRM (createdById null: бот, правила), с итогом result (если
   * итог не записан): клиенту ответили — задачи «ответить» сделаны. Задачи, поставленные сотрудником, не трогаются.
   * Сколько закрыто.
   */
  closeOpenOfKind(t: { dealId: string; kind: TaskKind; result: string; at: Date }): Promise<number>;
  /** Закрыть открытые служебные задачи сделки, заголовок которых начинается с prefix (кроме keepTitle); сколько закрыто. */
  closeOpenByPrefix(t: { dealId: string; prefix: string; keepTitle?: string | null; at: Date }): Promise<number>;
  setDone(id: string, doneAt: Date | null): Promise<void>;
  /**
   * Сделка перешла к другому: её открытые задачи прежнего ответственного (from) и ничьи — новому (to), напоминание
   * взводится заново. Задачи, поставленные на третьих сотрудников, не трогаются. Сколько задач перешло.
   */
  reassignOpenOfDeal(t: { dealId: string; from: string | null; to: string }): Promise<number>;
  /** Правка задачи; смена срока, напоминания или ответственного снимает отметку «напоминание ушло» — придёт новое. */
  update(id: string, patch: Partial<{ title: string; kind: TaskKind; dueAt: Date | null; remindBeforeMin: number | null; assigneeId: string; result: string | null }>): Promise<void>;
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

/** Сделки (контекст Sales): менеджер записал контакт с клиентом — неразобранная заявка принята в работу. */
export interface DealContacts {
  accept(dealId: string, staffId: string, how: string): Promise<void>;
}

export interface StaffNotifier {
  notify(userIds: string[], n: { kind: "task" | "reminder" | "mention"; title: string; body: string; link: string | null }): Promise<void>;
  /** Всем, кто видит сделки (право deals.view): напоминание о ничьей задаче; push false — только колокольчик (ночью). */
  dealsTeam(n: { kind: "task" | "reminder"; title: string; body: string; link: string | null; push?: boolean }): Promise<void>;
}

/** Чем пользовался клиент на сайте: заходил ли, книги, заказы (новый ли это аккаунт). */
export interface AccountUsage {
  lastSeenAt: Date | null;
  books: number;
  orders: number;
}

/** Личное сообщение сотруднику в WhatsApp на его номер (реализует container); false — номера нет или не отправилось. */
export interface StaffMessenger {
  send(userId: string, text: string): Promise<boolean>;
}
