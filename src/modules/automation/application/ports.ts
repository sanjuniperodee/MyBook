import type { AutomationRule, Holiday, RuleSubject, TriggerContext } from "../domain";

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
  /** Последний диалог клиента в WhatsApp — по сделке или по клиенту (сообщение о заказе — только в существующий). */
  latestWhatsapp(dealId: string | null, clientId: string | null): Promise<string | null>;
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
   * пришедшее сообщение клиента (автоответ): окно и суточный лимит его не держат. transactional — сообщение о заказе:
   * уходит и в диалог, который ведёт бот; allow — значения, которые в тексте не реквизиты (трек-номер из цифр);
   * noteDealId — куда заметка, если сообщение не ушло (сделка заказа), без него — в сделку диалога.
   */
  sendMessage(conversationId: string, text: string, opts?: { rule: string; reply?: boolean; transactional?: boolean; allow?: string[]; noteDealId?: string | null }): Promise<void>;
  /** Можно ли сейчас написать клиенту первым: окно и суточный лимит сообщений от правил (automation-15). */
  canMessageNow(): Promise<boolean>;
  assignConversation(conversationId: string, userId: string): Promise<void>;
  /** Запись CRM в истории сделки (без автора, одна с таким текстом на сделку): готовый текст клиенту. */
  addNote(note: { dealId: string; clientId: string | null; text: string }): Promise<void>;
  /** Уведомить сотрудников; без адресатов — всех с правом deals.view. */
  notify(userIds: string[] | "staff", n: { kind: "task" | "sla" | "system"; title: string; body: string; link: string | null }): Promise<void>;
}

/** Продажи (контекст Sales) — через узкий порт. */
export interface SalesGateway {
  nextRoundRobin(): Promise<string | null>;
  assign(dealId: string, userId: string): Promise<void>;
  move(dealId: string, stageId: string): Promise<void>;
  findOpenDealId(clientId: string): Promise<string | null>;
  /** automationId — правило, которое создаёт сделку: по нему считается его статистика. */
  createDeal(input: { title: string; source: "repeat" | "manual"; clientId: string; contactName: string; contactPhone: string | null; contactEmail: string; assigneeId: string | null; automationId: string }): Promise<{ id: string; assigneeId: string | null }>;
}

/**
 * Кандидаты для правил по времени — до 200 за проход, по порядку важности; объекты, для которых правило ruleId уже
 * сработало (тот же subject), в выборку не попадают.
 */
export interface ScheduledSource {
  unanswered(ruleId: string, awaitingSince: Date): Promise<{ conversationId: string; dealId: string | null; clientId: string | null; channel: string; awaitingSince: Date }[]>;
  inactiveClients(ruleId: string, days: number): Promise<{ dealId: string; clientId: string; lastSeen: Date }[]>;
  /**
   * Годовщины покупок к поводу через 0…daysBefore дней от today (ГГГГ-ММ-ДД по поясу магазина): заказ сайта (orderId)
   * или выигранная сделка из чата (dealId). Клиент, который уже купил к этой годовщине снова — покупка не раньше чем за
   * repurchaseDays дней до неё или покупка к той же дате, — не выбирается; покупка к другому поводу раньше этого
   * годовщину не гасит (automation-d6). occasion и date — по-русски (задачи, сделки), client — на языке клиента;
   * recipient — кому дарили (получатель книги или поле сделки «Для кого»).
   */
  anniversaries(
    ruleId: string,
    today: string,
    daysBefore: number,
    repurchaseDays: number,
  ): Promise<{ orderId: string | null; dealId: string | null; clientId: string; occasion: string; date: string; year: number; recipient: string | null; client: { occasion: string; date: string } }[]>;
  /**
   * Покупатели к празднику прошлого года: оплата или выигранная сделка в днях from…to (ГГГГ-ММ-ДД по поясу магазина).
   * Без открытой сделки, без покупки с seasonFrom (уже купили в этом сезоне), не из стоп-листа; клиент, для которого
   * правило уже сработало к этому празднику (holiday:<id>:<год праздника>:<клиент>), не выбирается. Первыми — кто
   * в прошлом году купил раньше всех (печатной книге нужен запас по времени), не больше limit. occasion и date
   * (праздника, ГГГГ-ММ-ДД в q.date) — по-русски, client — на языке клиента.
   */
  holidayBuyers(
    ruleId: string,
    q: { holiday: Holiday; date: string; from: string; to: string; seasonFrom: string; limit: number },
  ): Promise<{ clientId: string; occasion: string; date: string; client: { occasion: string; date: string } }[]>;
  /**
   * «Успеть к дате»: открытые (не «неразобранные») сделки с «Датой события» (ГГГГ-ММ-ДД) в днях from…to. bookBelow —
   * книга сделки заполнена меньше стольких процентов (null — не проверять), unpaid — по сделке ничего не оплачено.
   * Ближайшие даты — первыми; сделка, для которой правило уже сработало на эту дату (deal:<id>:event_date:<дата>), не
   * выбирается. occasion и date — по-русски (задачи), client — на языке клиента.
   */
  eventDates(
    ruleId: string,
    q: { from: string; to: string; bookBelow: number | null; unpaid: boolean },
  ): Promise<{ dealId: string; clientId: string | null; eventDate: string; occasion: string; date: string; client: { occasion: string; date: string } }[]>;
  /**
   * «Сделка без активности»: открытые (не «неразобранные») сделки без открытой задачи, у которых последняя активность
   * раньше before — смена этапа, сообщение в чатах сделки (кроме сообщений правил), задача (поставлена или закрыта),
   * звонок, заметка сотрудника. stageId — только этот этап. Клиент из стоп-листа «не писать первым» не выбирается.
   * Недавно затихшие — первыми, не больше limit; сделка, для которой правило уже сработало за это затишье
   * (deal:<id>:idle:<последняя активность>), не выбирается. date — день последней активности по-русски.
   */
  idleDeals(
    ruleId: string,
    q: { before: Date; stageId: string | null; limit: number },
  ): Promise<{ dealId: string; clientId: string | null; stageId: string; lastActivity: Date; date: string }[]>;
  /**
   * «Клиент молчит после нашего ответа»: последний ответ человека в диалоге (last_outgoing_at) — в since…before, после
   * него клиент не писал. Диалог открыт и не ждёт ответа, бот его не ведёт, сделка диалога в работе и без открытой
   * задачи, клиент и собеседник не в стоп-листе. Дольше всех молчащие — первыми, до 100; диалог, по которому правило
   * уже сработало за этот ответ (conv:<id>:silent:<ответ>), не выбирается. date — день нашего ответа по-русски.
   */
  silent(
    ruleId: string,
    q: { before: Date; since: Date },
  ): Promise<{ conversationId: string; dealId: string; clientId: string | null; channel: string; lastOutgoingAt: Date; date: string }[]>;
  /** Сколько раз правило сработало с начала дня day (ГГГГ-ММ-ДД по поясу магазина) — для лимита «в день». */
  firedOn(ruleId: string, day: string): Promise<number>;
}

/** Праздники для повторных продаж — настройка «Интеграции» → CRM. */
export interface HolidayCalendar {
  list(): Promise<Holiday[]>;
}

export interface AppInfo {
  readonly url: string;
}
