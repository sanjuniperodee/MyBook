import { automationTriggers, type AutomationTrigger } from "@/modules/automation/domain/meta";

export { automationActions, automationHours, automationTriggers, fillTemplate, isTrigger, templateVars, type AutomationActionType, type AutomationTrigger } from "@/modules/automation/domain/meta";

export interface RuleAction {
  type: "create_task" | "send_message" | "assign" | "move_stage" | "notify" | "create_deal";
  title?: string;
  text?: string;
  dueMinutes?: number;
  userId?: string | null;
  stageId?: string;
}

/** Правило автоматизации: событие → условия → действия. */
export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  conditions: Record<string, string | number | null>;
  actions: RuleAction[];
}

/** Контекст срабатывания. */
export interface TriggerContext {
  /** Объект срабатывания: одно правило не выполняется дважды для одного subject. */
  subject: string;
  dealId?: string | null;
  clientId?: string | null;
  conversationId?: string | null;
  callId?: string | null;
  orderId?: string | null;
  stageId?: string | null;
  source?: string | null;
  channel?: string | null;
  /** Сейчас рабочее время отдела продаж (для условия «только в рабочее / вне рабочего»). */
  workTime?: boolean;
  /** Повод и дата — для повторных продаж. */
  occasion?: string | null;
  date?: string | null;
}

/** Условия: этап, источник, канал, рабочее время. Пустое условие — подходит всё. */
export function matches(rule: Pick<AutomationRule, "conditions">, ctx: TriggerContext) {
  const c = rule.conditions ?? {};
  if (c.hours === "work" && ctx.workTime === false) return false;
  if (c.hours === "off" && ctx.workTime !== false) return false;
  for (const key of ["stageId", "source", "channel"] as const) {
    const want = c[key];
    if (want && String(want) !== String(ctx[key] ?? "")) return false;
  }
  return true;
}

/** Условия, которые имеют смысл для события (остальные из формы отбрасываем). */
export function relevantConditions(trigger: string, c: { stageId?: string | null; source?: string | null; channel?: string; minutes?: number; days?: number; daysBefore?: number; hours?: string | null }) {
  const out: Record<string, string | number | null> = {};
  if (trigger === "deal.stage_changed" && c.stageId) out.stageId = c.stageId;
  if (trigger === "deal.created" && c.source) out.source = c.source;
  if (trigger.startsWith("message.") && c.channel) out.channel = c.channel;
  if (trigger === "message.unanswered") out.minutes = c.minutes ?? 15;
  if (trigger === "client.inactive") out.days = c.days ?? 5;
  if (trigger === "occasion.anniversary") out.daysBefore = c.daysBefore ?? 30;
  if (c.hours === "work" || c.hours === "off") out.hours = c.hours;
  return out;
}

/** Нужно ли правилу знать, рабочее ли сейчас время. */
export const needsWorkTime = (rules: readonly Pick<AutomationRule, "conditions">[]) => rules.some((r) => r.conditions?.hours === "work" || r.conditions?.hours === "off");

/** Число из условия правила в допустимых пределах (минуты, дни). */
export function conditionNumber(rule: Pick<AutomationRule, "conditions">, key: string, fallback: number, max = Infinity) {
  return Math.min(max, Math.max(1, Number(rule.conditions?.[key] ?? fallback) || fallback));
}

/** Что сработало — для объекта, который загрузили под правило. */
export interface RuleSubject {
  deal?: { id: string; number: number; title: string; assigneeId: string | null; orderId: string | null; clientId: string | null; customFields: Record<string, string | number | boolean | null> } | null;
  conversation?: { id: string; assigneeId: string | null; contactName: string; lastMessageText: string; clientId: string | null } | null;
  call?: { id: string; staffId: string | null; clientId: string | null } | null;
  orderNumber?: number | null;
  clientId: string | null;
  /** Имя клиента для шаблонов. */
  name: string;
  assigneeId: string | null;
}

/** Куда вести сотрудника из уведомления: для переписки — в чат, для остального — в сделку. */
export function linkFor(ctx: TriggerContext, s: RuleSubject) {
  if (s.conversation) return `/admin/chats?c=${s.conversation.id}`;
  if (s.deal) return `/admin/deals/${s.deal.id}`;
  if (ctx.orderId) return `/admin/orders/${ctx.orderId}`;
  if (s.call) return "/admin/calls";
  if (s.clientId) return `/admin/clients/${s.clientId}`;
  return null;
}

export const triggerLabel = (trigger: string) => automationTriggers[trigger as AutomationTrigger]?.label;
