import type { AutomationRule, RuleSubject, TriggerContext } from "../domain";

export interface RuleRepository {
  active(trigger?: string): Promise<AutomationRule[]>;
  /** Отметка о срабатывании до действий: при гонке двух вебхуков выполнит только один. */
  claim(ruleId: string, subject: string): Promise<boolean>;
  markRun(ruleId: string, at: Date): Promise<void>;
}

/** Загрузка объекта срабатывания: сделка, диалог, звонок, заказ, клиент. */
export interface SubjectLoader {
  load(ctx: TriggerContext): Promise<RuleSubject>;
  managerName(userId: string | null): Promise<string>;
  /** Значения своих полей сделки по подписям («Для кого» → «Мама»). */
  dealFieldVars(customFields: Record<string, string | number | boolean | null>): Promise<Record<string, string>>;
  /** Последний диалог сделки или клиента — куда отправить сообщение. */
  latestConversation(dealId: string | null, clientId: string | null): Promise<string | null>;
  clientContact(clientId: string): Promise<{ name: string; email: string; phone: string | null; managerId: string | null } | null>;
}

/** Действия правил в других частях CRM. */
export interface AutomationEffects {
  /**
   * Задача через сервис задач: с напоминанием о сроке, автор — CRM; без ответственного — ничья (видят все). once — одна
   * открытая задача с этим заголовком на сделку; false — не поставлена (такая уже открыта).
   */
  createTask(task: { title: string; kind: "call" | "message" | "task"; dueAt: Date; clientId: string | null; dealId: string | null; orderId: string | null; assigneeId: string | null; once?: boolean }): Promise<boolean>;
  /**
   * Сообщение клиенту от правила (rule — его название, для заметки, если текст не отправлен). reply — ответ на только что
   * пришедшее сообщение клиента (автоответ): окно и суточный лимит его не держат.
   */
  sendMessage(conversationId: string, text: string, opts?: { rule: string; reply?: boolean }): Promise<void>;
  /** Можно ли сейчас написать клиенту первым: окно и суточный лимит сообщений от правил (automation-15). */
  canMessageNow(): Promise<boolean>;
  assignConversation(conversationId: string, userId: string): Promise<void>;
  /** Уведомить сотрудников; без адресатов — всех с правом deals.view. */
  notify(userIds: string[] | "staff", n: { kind: "task" | "sla" | "system"; title: string; body: string; link: string | null }): Promise<void>;
}

/** Продажи (контекст Sales) — через узкий порт. */
export interface SalesGateway {
  nextRoundRobin(): Promise<string | null>;
  assign(dealId: string, userId: string): Promise<void>;
  move(dealId: string, stageId: string): Promise<void>;
  findOpenDealId(clientId: string): Promise<string | null>;
  createDeal(input: { title: string; source: "repeat" | "manual"; clientId: string; contactName: string; contactPhone: string | null; contactEmail: string; assigneeId: string | null }): Promise<{ id: string; assigneeId: string | null }>;
}

/** Кандидаты для правил по времени. */
export interface ScheduledSource {
  unanswered(awaitingSince: Date): Promise<{ conversationId: string; dealId: string | null; clientId: string | null; channel: string; awaitingSince: Date }[]>;
  inactiveClients(days: number): Promise<{ dealId: string; clientId: string; lastSeen: Date }[]>;
  anniversaries(daysBefore: number): Promise<{ orderId: string; clientId: string; occasion: string; date: string; year: number }[]>;
}

export interface AppInfo {
  readonly url: string;
}
