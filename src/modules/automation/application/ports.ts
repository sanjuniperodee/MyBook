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
  createTask(task: { title: string; kind: "call" | "message" | "task"; dueAt: Date; clientId: string | null; dealId: string | null; orderId: string | null; assigneeId: string | null }): Promise<void>;
  sendMessage(conversationId: string, text: string): Promise<void>;
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

export interface WorkSchedule {
  isWorkTime(at: Date): Promise<boolean>;
  workMinutesBetween(from: Date, to: Date): Promise<number>;
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
