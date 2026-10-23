import { automationTriggers, type AutomationTrigger } from "@/modules/automation/domain/meta";
import { fillTemplate } from "@/shared/domain/templates";
import { ANNIVERSARY_DEFAULTS, ANNIVERSARY_LIMITS } from "./anniversary";
import { bookBelowPercent, EVENT_DATE_DEFAULTS, EVENT_DATE_LIMITS } from "./eventDate";
import { IDLE_DEFAULTS, IDLE_LIMITS } from "./idle";
import { SILENT_DEFAULTS, SILENT_LIMITS } from "./silent";

type TemplateVars = Parameters<typeof fillTemplate>[1];

export type { AutomationTrigger } from "@/modules/automation/domain/meta";

export interface RuleAction {
  type: "create_task" | "send_message" | "assign" | "move_stage" | "notify" | "create_deal" | "draft_message";
  title?: string;
  text?: string;
  /** Текст клиенту на казахском: его получает клиент с казахским языком (users.locale); пусто — русский text. */
  textKk?: string;
  dueMinutes?: number;
  userId?: string | null;
  stageId?: string;
  /** «Уведомить сотрудников» без конкретного сотрудника: руководителям (managers), иначе — ответственному. */
  to?: "managers";
  /** «Уведомить» — ещё и личным сообщением в WhatsApp на номер сотрудника (только в рабочее время). */
  whatsapp?: boolean;
}

/**
 * Правило «Приближается праздник» по умолчанию: за 30 дней (печать 7 рабочих дней, доставка и время написать книгу);
 * покупатели прошлого года — за 30 дней до праздника (печатную книгу к празднику оплачивают за 2–4 недели);
 * не больше 30 клиентов в день (задачи одному-двум менеджерам). Пределы — дни до 120, клиентов до 200 в день.
 */
export const HOLIDAY_DEFAULTS = { daysBefore: 30, windowDays: 30, perDay: 30 } as const;
export const HOLIDAY_LIMITS = { daysBefore: 120, windowDays: 90, perDay: 200 } as const;

/** Срок задачи правила по умолчанию — час. */
export const DEFAULT_TASK_DUE_MIN = 60;
/** С какого срока (минут) он календарный, а не в рабочем времени, — сутки. */
const CALENDAR_DUE_FROM_MIN = 24 * 60;

/**
 * Срок задачи правила (automation-d3): до суток — в рабочих минутах (ночь и выходные не в счёт: пропущенный в 23:00
 * звонок «через 15 минут» — к 09:15, а не просрочен к началу смены); от суток — календарный срок, а если он выпал на
 * нерабочее время — начало ближайшей смены («через день» не растягивается в два). Возвращает, от какого момента
 * отсчитать сколько рабочих минут (WorkSchedule.addWorkMinutes).
 */
export function ruleTaskDue(now: Date, dueMinutes: number | undefined): { from: Date; workMinutes: number } {
  const minutes = Math.max(0, dueMinutes ?? DEFAULT_TASK_DUE_MIN);
  return minutes >= CALENDAR_DUE_FROM_MIN ? { from: new Date(now.getTime() + minutes * 60_000), workMinutes: 0 } : { from: now, workMinutes: minutes };
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
  /** Новый статус заказа (order.status_changed). */
  orderStatus?: string | null;
  /** Сейчас рабочее время отдела продаж (для условия «только в рабочее / вне рабочего»). */
  workTime?: boolean;
  /** Повод и дата — для повторных продаж: по-русски, для задач, сделок и уведомлений сотрудникам. */
  occasion?: string | null;
  date?: string | null;
  /** Они же на языке клиента — для казахского текста клиенту (textKk). */
  clientVars?: { occasion?: string | null; date?: string | null } | null;
  /** Кому дарили книгу (повторные продажи): {получатель}. */
  recipient?: string | null;
}

/** Условие «только в рабочее время» / «только вне рабочего»: подходит ли сейчас (workTime — рабочее ли время). */
export function inRuleHours(rule: Pick<AutomationRule, "conditions">, workTime: boolean | undefined) {
  const hours = rule.conditions?.hours;
  return !(hours === "work" && workTime === false) && !(hours === "off" && workTime !== false);
}

/** Условия: этап, источник, канал, статус заказа, рабочее время. Пустое условие — подходит всё. */
export function matches(rule: Pick<AutomationRule, "conditions">, ctx: TriggerContext) {
  const c = rule.conditions ?? {};
  if (!inRuleHours(rule, ctx.workTime)) return false;
  for (const key of ["stageId", "source", "channel", "orderStatus"] as const) {
    const want = c[key];
    if (want && String(want) !== String(ctx[key] ?? "")) return false;
  }
  return true;
}

/** Условия, которые имеют смысл для события (остальные из формы отбрасываем). */
export function relevantConditions(
  trigger: string,
  c: {
    stageId?: string | null;
    source?: string | null;
    channel?: string;
    orderStatus?: string | null;
    minutes?: number;
    days?: number;
    daysBefore?: number;
    windowDays?: number;
    perDay?: number;
    holiday?: string | null;
    hours?: string | null;
    /** «Успеть к дате»: книга заполнена меньше стольких процентов (пусто — не проверять). */
    bookBelow?: number | null;
    /** «Успеть к дате»: по сделке ничего не оплачено (1 — проверять). */
    unpaid?: number | null;
    /** «Клиент молчит после нашего ответа»: сколько часов. */
    silentHours?: number;
  },
) {
  const out: Record<string, string | number | null> = {};
  if ((trigger === "deal.stage_changed" || trigger === "deal.idle") && c.stageId) out.stageId = c.stageId;
  if (trigger === "order.status_changed" && c.orderStatus) out.orderStatus = c.orderStatus;
  if (trigger === "deal.created" && c.source) out.source = c.source;
  if (trigger.startsWith("message.") && c.channel) out.channel = c.channel;
  if (trigger === "message.unanswered") out.minutes = c.minutes ?? 15;
  if (trigger === "client.inactive") out.days = c.days ?? 5;
  if (trigger === "occasion.anniversary") {
    out.daysBefore = Math.min(ANNIVERSARY_LIMITS.daysBefore, c.daysBefore ?? ANNIVERSARY_DEFAULTS.daysBefore);
    out.windowDays = Math.min(ANNIVERSARY_LIMITS.windowDays, c.windowDays ?? ANNIVERSARY_DEFAULTS.windowDays);
  }
  if (trigger === "occasion.holiday") {
    out.daysBefore = c.daysBefore ?? HOLIDAY_DEFAULTS.daysBefore;
    out.windowDays = c.windowDays ?? HOLIDAY_DEFAULTS.windowDays;
    out.perDay = c.perDay ?? HOLIDAY_DEFAULTS.perDay;
    if (c.holiday) out.holiday = c.holiday;
  }
  if (trigger === "deal.event_date_near") {
    out.daysBefore = Math.min(EVENT_DATE_LIMITS.daysBefore, c.daysBefore ?? EVENT_DATE_DEFAULTS.daysBefore);
    const below = bookBelowPercent({ bookBelow: c.bookBelow ?? null });
    if (below) out.bookBelow = below;
    if (c.unpaid) out.unpaid = 1;
  }
  if (trigger === "deal.idle") {
    out.days = Math.min(IDLE_LIMITS.days, c.days ?? IDLE_DEFAULTS.days);
    out.perDay = Math.min(IDLE_LIMITS.perDay, c.perDay ?? IDLE_DEFAULTS.perDay);
  }
  if (trigger === "message.silent") out.silentHours = Math.min(SILENT_LIMITS.hours, c.silentHours ?? SILENT_DEFAULTS.hours);
  if (c.hours === "work" || c.hours === "off") out.hours = c.hours;
  return out;
}

/** Повторная продажа: сделка, которую создаёт такое правило, — с источником «повторная» (repeat). */
export const isRepeatTrigger = (trigger: string) => trigger === "occasion.anniversary" || trigger === "occasion.holiday";

/**
 * Правило только для сотрудников (automation-4, deals-21, automation-6): задача, уведомление, готовый текст в историю
 * сделки — «Отправить сообщение клиенту» в нём нет (решение владельца: о забытой сделке и замолчавшем клиенте клиенту не
 * пишем, пишет менеджер).
 */
export const isStaffOnlyTrigger = (trigger: string) => trigger === "deal.idle" || trigger === "message.silent";

/**
 * Правило пишет клиенту (действие «Отправить сообщение» с текстом): его держат окно и суточный лимит. Правило для
 * сотрудников клиенту не пишет — окно и лимит его задачу не откладывают.
 */
export const sendsMessage = (rule: Pick<AutomationRule, "actions" | "trigger">) =>
  !isStaffOnlyTrigger(rule.trigger) && (rule.actions ?? []).some((a) => a.type === "send_message" && !!a.text?.trim());

/**
 * Правило по времени, в котором сообщение клиенту — суть, а счёт идёт на дни: «клиент забросил книгу», годовщина повода,
 * праздник. Пока окно или суточный лимит сообщений от правил закрыты, объект не застолбляется — правило сработает в
 * следующем проходе (утром, завтра) целиком. Остальные правила по времени («клиенту не ответили N минут», «приближается
 * дата события») не ждут: задачи и уведомления сотрудникам — сразу, а сообщение sendAutomated пропустит с заметкой в
 * сделку. Иначе лимит, выбранный другими правилами, глушил бы до утра и уведомление о клиенте без ответа.
 */
export const waitsForMessaging = (rule: Pick<AutomationRule, "actions" | "trigger">) =>
  (rule.trigger === "client.inactive" || isRepeatTrigger(rule.trigger)) && sendsMessage(rule);

/**
 * Сообщение о заказе (статус, трек, оплата, оформление) — транзакционное (chats-15, chats-d5): уходит и в диалог, который
 * ведёт бот (бота не останавливает), но только в существующую переписку WhatsApp — первым на новый номер CRM не пишет
 * (automation-11). Окно, лимит и «не писать первым» держат и его.
 */
export const isTransactionalTrigger = (trigger: string) => trigger.startsWith("order.");

/** Заметка в сделку: сообщение о заказе не ушло — с клиентом нет переписки в WhatsApp. */
export const noWhatsappNote = (rule: string) =>
  `Правило «${rule}» не отправило клиенту сообщение: с ним нет переписки в WhatsApp, а первым на новый номер CRM не пишет. Если нужно — напишите клиенту сами; письмо о заказе уходит, если у клиента настоящая почта.`;

/** Ответ на только что пришедшее сообщение клиента (автоответ): окно и лимит его не держат, «не писать первым» — держит. */
export const isReplyTrigger = (trigger: string) => trigger === "message.incoming";

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
  /** Трек-номер посылки заказа: {трек}. */
  trackingNumber?: string | null;
  /**
   * Ссылки на сайт на языке клиента: заказ ({ссылка_на_заказ}), книга — заказа или последняя книга клиента
   * ({ссылка_на_книгу}), оплата — неоплаченный заказ или открытый счёт из чата ({ссылка_на_оплату}).
   */
  links?: { order: string | null; book: string | null; pay: string | null };
  clientId: string | null;
  /** Имя клиента для шаблонов. */
  name: string;
  assigneeId: string | null;
  /** Язык клиента (users.locale); без клиента — русский. */
  locale?: "ru" | "kk";
}

/**
 * Текст клиенту на его языке: казахоязычному — казахский вариант действия (если задан) с поводом и датой по-казахски,
 * остальным — русский текст с русскими подписями: язык в одном сообщении не смешивается.
 */
export function clientText(a: Pick<RuleAction, "text" | "textKk">, locale: RuleSubject["locale"], vars: TemplateVars, clientVars: TriggerContext["clientVars"]) {
  const kk = locale === "kk" && !!a.textKk?.trim();
  return fillTemplate((kk ? a.textKk : a.text) ?? "", kk ? { ...vars, ...clientVars } : vars);
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
