import { AsyncLocalStorage } from "node:async_hooks";
import type { Clock, Logger, WorkSchedule } from "@/shared/application";
import {
  anniversaryQuery,
  clientText,
  conditionNumber,
  DEFAULT_HOLIDAYS,
  DEFER_MAX_MS,
  DEFERRED_BATCH,
  RUN_DETAILS_KEEP_DAYS,
  eventDateQuery,
  eventDateSubject,
  HOLIDAY_DEFAULTS,
  HOLIDAY_LIMITS,
  holidayWindows,
  idleQuery,
  idleSubject,
  inRuleHours,
  isRepeatTrigger,
  isReplyTrigger,
  isStaffOnlyTrigger,
  isTransactionalTrigger,
  linkFor,
  matches,
  needsWorkTime,
  noWhatsappNote,
  ruleTaskDue,
  silentQuery,
  silentSubject,
  triggerLabel,
  upcomingHolidays,
  waitsForMessaging,
  type AutomationRule,
  type AutomationTrigger,
  type RuleAction,
  type RuleSubject,
  type RunDetails,
  type RunStatus,
  type RunStep,
  type TriggerContext,
} from "../domain";
import { draftNote, fillTemplate } from "@/shared/domain/templates";
import { zonedDay } from "@/shared/domain/time";
import type { AppInfo, AutomationEffects, HolidayCalendar, RuleRepository, SalesGateway, ScheduledSource, SendOutcome, SubjectLoader } from "./ports";

/** Что сделало действие — шаг журнала без номера. */
type Step = Omit<RunStep, "i" | "action">;
const ok: Step = { result: "ok" };
const skipped = (note: string): Step => ({ result: "skipped", note });

/** Итог отправки сообщения правила — шаг журнала. */
const sendStep = (o: SendOutcome): Step =>
  o === "sent" ? ok : o === "deferred" ? { result: "deferred", note: "ждёт окна сообщений от правил" } : o === "failed" ? { result: "error", note: "шлюз не принял сообщение" } : skipped("не отправлено — причина в заметке сделки");

/** «Повторить» срабатывание, которое «выполняется» дольше этого, — процесс упал посреди действий. */
const STALE_RUN_MS = 10 * 60_000;

export type RetryResult = "ok" | "notFound" | "notFailed" | "ruleOff";

/** Защита от зацикливания: правило двигает сделку → срабатывает правило на этап → … */
const MAX_DEPTH = 3;

/**
 * Движок «цифровой воронки»: событие → правила с подходящими условиями → действия.
 * Каждое правило срабатывает для объекта один раз; ошибка одного правила не мешает остальным.
 */
export class AutomationEngine {
  readonly #depth = new AsyncLocalStorage<number>();
  #lastSlowRun = 0;
  /** Правило «праздник», которое сегодня уже прошло выборку: до завтра её не повторяем (id правила → день). */
  readonly #holidayDone = new Map<string, string>();

  constructor(
    private readonly rules: RuleRepository,
    private readonly subjects: SubjectLoader,
    private readonly effects: AutomationEffects,
    private readonly sales: SalesGateway,
    private readonly schedule: WorkSchedule,
    private readonly scheduled: ScheduledSource,
    private readonly app: AppInfo,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly holidays: HolidayCalendar = { list: async () => [...DEFAULT_HOLIDAYS] },
  ) {}

  async run(trigger: AutomationTrigger, initial: TriggerContext) {
    const level = this.#depth.getStore() ?? 0;
    if (level >= MAX_DEPTH) return;
    await this.#depth.run(level + 1, async () => {
      let rules: AutomationRule[];
      try {
        rules = await this.rules.active(trigger);
      } catch (err) {
        this.logger.error("load rules", err);
        return;
      }
      let ctx = initial;
      if (ctx.workTime === undefined && needsWorkTime(rules)) ctx = { ...ctx, workTime: await this.schedule.isWorkTime(this.clock.now()) };
      for (const rule of rules) {
        if (!matches(rule, ctx)) continue;
        // Событийное правило: сообщение вне окна или сверх лимита ждёт и уходит позже (automation-d1).
        await this.execute(rule, ctx, { defer: !isReplyTrigger(rule.trigger) }).catch((err) => this.logger.error(`«${rule.name}»`, err));
      }
    });
  }

  private async execute(rule: AutomationRule, ctx: TriggerContext, opts: { defer?: boolean } = {}): Promise<boolean> {
    const key = ctx.subject.slice(0, 200);
    if (!(await this.rules.claim(rule.id, key))) return false;
    try {
      await this.runActions(rule, ctx, key, { defer: !!opts.defer });
    } finally {
      await this.rules.markRun(rule.id, this.clock.now());
    }
    return true;
  }

  /**
   * Действия правила с записью в журнал (automation-13): шаг на действие, итог — done, error (исключение или шлюз не
   * принял сообщение) или deferred (сообщение ждёт окна). from — повтор с упавшего действия, only — досылка отложенных;
   * prev — шаги прошлого раза (остальные действия не повторяются). Исключение пишется в журнал и летит дальше.
   */
  private async runActions(rule: AutomationRule, ctx: TriggerContext, key: string, opts: { defer: boolean; from?: number; only?: readonly number[] }, prev: readonly RunStep[] = []): Promise<RunStatus> {
    const redo = (i: number) => i >= (opts.from ?? 0) && (!opts.only || opts.only.includes(i));
    const steps: RunStep[] = prev.filter((st) => !redo(st.i));
    let at = opts.from ?? 0;
    let failure: unknown = null;
    let subject: RuleSubject | null = null;
    try {
      subject = await this.subjects.load(ctx);
      for (const [i, action] of (rule.actions ?? []).entries()) {
        if (!redo(i)) continue;
        at = i;
        steps.push({ i, action: action.type, ...(await this.perform(rule, action, ctx, subject, opts.defer)) });
      }
    } catch (err) {
      failure = err;
    }
    steps.sort((a, b) => a.i - b.i);
    const stepError = steps.find((st) => st.result === "error");
    const deferred = steps.filter((st) => st.result === "deferred").map((st) => st.i);
    const status: RunStatus = failure || stepError ? "error" : deferred.length ? "deferred" : "done";
    // Сделка, созданная правилом, — в контекст: повтор и досылка работают в ней, а не создают новую.
    const saved = subject?.deal && !ctx.dealId ? { ...ctx, dealId: subject.deal.id } : ctx;
    const details: RunDetails = {
      ctx: saved,
      steps,
      ...(failure ? { error: failure instanceof Error ? failure.message : String(failure), failedAt: at } : stepError ? { error: stepError.note, failedAt: stepError.i } : {}),
      ...(deferred.length ? { deferred } : {}),
    };
    await this.rules.finish(rule.id, key, status, details).catch((err) => this.logger.error(`«${rule.name}»: журнал срабатывания`, err));
    if (failure) throw failure;
    return status;
  }

  /**
   * «Повторить» на странице правила: срабатывание с ошибкой (или «выполняется» дольше 10 минут — процесс упал) — с
   * упавшего действия, прошлые шаги не повторяются. Правило должно быть включено.
   */
  async retry(runId: string): Promise<RetryResult> {
    const run = await this.rules.findRun(runId);
    if (!run?.details) return "notFound";
    const rule = await this.rules.find(run.ruleId);
    if (!rule?.active) return "ruleOff";
    if (!(await this.rules.restart(run.id, ["error", "running"], new Date(this.clock.now().getTime() - STALE_RUN_MS)))) return "notFailed";
    const d = run.details;
    await this.runActions(rule, d.ctx, run.subject, { defer: !isReplyTrigger(rule.trigger), from: d.failedAt ?? 0 }, d.steps).catch((err) => this.logger.error(`«${rule.name}»: повтор`, err));
    await this.rules.markRun(rule.id, this.clock.now());
    return "ok";
  }

  /**
   * Отложенные сообщения событийных правил (automation-d1): окно открылось и лимит не выбран — дослать (только
   * отложенные действия). Ждут не дольше суток: потом — ошибка в журнале и заметка в сделку, менеджер напишет сам.
   */
  private async resendDeferred(now: Date) {
    const runs = await this.rules.deferredRuns(DEFERRED_BATCH);
    if (!runs.length) return;
    let open: boolean | null = null;
    for (const run of runs) {
      const d = run.details;
      const rule = await this.rules.find(run.ruleId);
      const expired = now.getTime() - run.createdAt.getTime() > DEFER_MAX_MS;
      if (!d || !rule?.active || expired) {
        if (!(await this.rules.restart(run.id, ["deferred"]))) continue;
        const why = !rule?.active ? "правило выключено — сообщение не отправлено" : "окно сообщений от правил не открылось за сутки — сообщение не отправлено";
        const steps = (d?.steps ?? []).map((st) => (st.result === "deferred" ? { ...st, result: "error" as const, note: why } : st));
        await this.rules.finish(run.ruleId, run.subject, "error", { ctx: d?.ctx ?? { subject: run.subject }, steps, error: why, failedAt: d?.deferred?.[0] });
        if (expired && rule?.active && d?.ctx.dealId)
          await this.effects.addNote({ dealId: d.ctx.dealId, clientId: d.ctx.clientId ?? null, text: `Правило «${rule.name}» не отправило клиенту сообщение: за сутки так и не открылось окно сообщений от правил (или лимит был исчерпан). Если нужно — напишите клиенту сами.` });
        continue;
      }
      open ??= await this.effects.canMessageNow();
      if (!open) return;
      if (!(await this.rules.restart(run.id, ["deferred"]))) continue;
      const status = await this.runActions(rule, d.ctx, run.subject, { defer: true, only: d.deferred ?? [] }, d.steps).catch((err) => (this.logger.error(`«${rule.name}»: отложенное сообщение`, err), "error" as const));
      // Лимит кончился посреди досылки — остальные подождут следующего прохода.
      if (status === "deferred") return;
    }
  }

  private async vars(ctx: TriggerContext, s: RuleSubject) {
    return {
      name: s.name,
      order: s.orderNumber ?? null,
      // {ссылка} — самое нужное клиенту: его заказ, иначе его книга, иначе сайт (automation-11).
      link: s.links?.order || s.links?.book || this.app.url,
      track: s.trackingNumber ?? "",
      orderUrl: s.links?.order ?? "",
      bookUrl: s.links?.book ?? "",
      payUrl: s.links?.pay ?? "",
      manager: await this.subjects.managerName(s.assigneeId),
      occasion: ctx.occasion ?? "",
      date: ctx.date ?? "",
      // Кому дарили: из покупки, к которой годовщина, иначе — поле сделки «Для кого».
      recipient: ctx.recipient || String(s.deal?.customFields?.recipient ?? ""),
      fields: s.deal ? await this.subjects.dealFieldVars(s.deal.customFields) : {},
    };
  }

  private async perform(rule: AutomationRule, a: RuleAction, ctx: TriggerContext, s: RuleSubject, defer = false): Promise<Step> {
    const vars = await this.vars(ctx, s);
    switch (a.type) {
      case "create_task": {
        const assigneeId = a.userId || s.deal?.assigneeId || s.assigneeId;
        const title = fillTemplate(a.title || rule.name, vars) || rule.name;
        // Срок — в рабочем времени; по сделке — одна открытая такая задача (повтор пропущенного звонка не множит её).
        const due = ruleTaskDue(this.clock.now(), a.dueMinutes);
        const created = await this.effects.createTask({
          title: title.slice(0, 200),
          kind: ctx.callId ? "call" : ctx.conversationId ? "message" : "task",
          dueAt: await this.schedule.addWorkMinutes(due.from, due.workMinutes),
          clientId: s.clientId,
          dealId: s.deal?.id ?? null,
          orderId: ctx.orderId ?? null,
          assigneeId,
          once: true,
        });
        if (!created) return skipped("такая задача по сделке уже открыта");
        await this.effects.notify(assigneeId ? [assigneeId] : "staff", { kind: "task", title: `Задача: ${title}`, body: rule.name, link: linkFor(ctx, s) ?? "/admin/tasks" });
        return ok;
      }
      case "send_message": {
        // Правило для сотрудников (забытая сделка): клиенту не пишет, даже если действие попало в правило мимо редактора.
        if (isStaffOnlyTrigger(rule.trigger)) {
          this.logger.warn(`«${rule.name}»: правило для сотрудников — сообщение клиенту не отправлено`);
          return skipped("правило для сотрудников — клиенту не пишет");
        }
        const text = clientText(a, s.locale, vars, ctx.clientVars);
        if (!text) return skipped("пустой текст");
        if (isTransactionalTrigger(rule.trigger)) return this.sendTransactional(rule, text, s, defer);
        const convId = s.conversation?.id ?? (await this.subjects.latestConversation(s.deal?.id ?? null, s.clientId));
        if (!convId) return skipped("у клиента нет переписки");
        return sendStep(await this.effects.sendMessage(convId, text, { rule: rule.name, reply: isReplyTrigger(rule.trigger), ...(defer ? { defer } : {}) }));
      }
      case "assign": {
        const userId = a.userId || (await this.sales.nextRoundRobin());
        if (!userId) return skipped("некого назначить: никого нет на смене");
        if (s.deal && !s.deal.assigneeId) await this.sales.assign(s.deal.id, userId);
        if (s.conversation && !s.conversation.assigneeId) await this.effects.assignConversation(s.conversation.id, userId);
        s.assigneeId = s.assigneeId ?? userId;
        return ok;
      }
      case "move_stage": {
        if (!s.deal || !a.stageId) return skipped("нет сделки");
        await this.sales.move(s.deal.id, a.stageId);
        return ok;
      }
      case "create_deal": {
        if (s.deal) return skipped("сделка уже есть"); // открытая сделка уже есть — работаем в ней
        if (!s.clientId) return skipped("нет клиента");
        const open = await this.sales.findOpenDealId(s.clientId);
        if (open) {
          s.deal = (await this.subjects.load({ subject: "", dealId: open })).deal;
          return skipped("у клиента есть открытая сделка");
        }
        const client = await this.subjects.clientContact(s.clientId);
        if (!client) return skipped("клиент не найден");
        const deal = await this.sales.createDeal({
          title: fillTemplate(a.title || rule.name, vars) || rule.name,
          source: isRepeatTrigger(rule.trigger) ? "repeat" : "manual",
          clientId: s.clientId,
          contactName: client.name,
          contactPhone: client.phone,
          contactEmail: client.email,
          assigneeId: a.userId || client.managerId || null,
          automationId: rule.id,
        });
        s.deal = (await this.subjects.load({ subject: "", dealId: deal.id })).deal;
        s.assigneeId = s.assigneeId ?? deal.assigneeId;
        return ok;
      }
      case "draft_message": {
        // Текст кладётся в историю сделки — без сделки его негде показать (поставьте раньше «Создать сделку»).
        if (!s.deal) return skipped("нет сделки — текст негде показать");
        const text = clientText(a, s.locale, vars, ctx.clientVars);
        if (!text) return skipped("пустой текст");
        await this.effects.addNote({ dealId: s.deal.id, clientId: s.clientId, text: draftNote(rule.name, text) });
        return ok;
      }
      case "notify": {
        const to = a.userId ? [a.userId] : s.assigneeId ? [s.assigneeId] : "staff";
        const fallback = s.conversation ? `${s.name || "Клиент"}: ${s.conversation.lastMessageText}` : s.deal ? `№${s.deal.number} ${s.deal.title}` : rule.name;
        await this.effects.notify(to, {
          kind: rule.trigger === "message.unanswered" ? "sla" : "system",
          title: fillTemplate(a.title || triggerLabel(rule.trigger) || rule.name, vars),
          body: a.text ? fillTemplate(a.text, vars) : fallback,
          link: linkFor(ctx, s),
        });
        return ok;
      }
    }
    return skipped("неизвестное действие");
  }

  /**
   * Сообщение о заказе (chats-15, chats-d5): в существующую переписку клиента в WhatsApp, и когда её ведёт бот. Переписки
   * нет — не уходит (первым на новый номер CRM не пишет), а в сделку — заметка, чтобы менеджер знал и написал сам.
   * Пропуск при отправке (стоп-лист, реквизиты, окно, лимит) — тоже заметкой в сделку заказа: переписка, найденная по
   * клиенту, может быть привязана к его прошлой сделке или ни к какой.
   */
  private async sendTransactional(rule: AutomationRule, text: string, s: RuleSubject, defer: boolean): Promise<Step> {
    const convId = await this.subjects.latestWhatsapp(s.deal?.id ?? null, s.clientId);
    if (convId) return sendStep(await this.effects.sendMessage(convId, text, { rule: rule.name, transactional: true, allow: s.trackingNumber ? [s.trackingNumber] : [], noteDealId: s.deal?.id ?? null, ...(defer ? { defer } : {}) }));
    if (s.deal) await this.effects.addNote({ dealId: s.deal.id, clientId: s.clientId, text: noWhatsappNote(rule.name) });
    else this.logger.info(`«${rule.name}»: нет ни переписки в WhatsApp, ни сделки — сообщение о заказе не отправлено`);
    return skipped("нет переписки в WhatsApp");
  }

  /**
   * Правила по времени. «Клиенту не ответили N минут» — каждый проход, считая только рабочее время;
   * «клиент забросил книгу», «годовщина повода», «приближается дата события», «сделка без активности» и «клиент молчит
   * после нашего ответа» — раз в 30 минут (force — сразу, для scheduler:once). «Забросил книгу», годовщина и праздник с
   * сообщением клиенту вне окна или сверх суточного лимита пропускаются без отметки и сработают позже; остальные
   * срабатывают сразу, а сообщение пропускает sendAutomated с заметкой в сделку (waitsForMessaging).
   * Не бросает: сбой загрузки правил или выборки одного правила пишется в лог, остальные правила и шаги минутного
   * прохода (напоминания, круг заявок, бот, почта, доступ по оплаченным счетам) идут дальше.
   */
  async runScheduled(opts: { force?: boolean } = {}) {
    const now = this.clock.now();
    let rules: AutomationRule[];
    let workTime: boolean;
    try {
      rules = await this.rules.active();
      if (!rules.length) return 0;
      workTime = await this.schedule.isWorkTime(now);
    } catch (err) {
      this.logger.error("правила по времени: загрузка правил и графика", err);
      return 0;
    }
    let fired = 0;
    /** Выборка для правила (кому не ответили, кто забросил книгу, годовщины): ошибка одного правила не мешает другим. */
    const each = async (trigger: AutomationTrigger, body: (rule: AutomationRule) => Promise<void>) => {
      for (const rule of rules.filter((r) => r.trigger === trigger)) {
        await body(rule).catch((err) => this.logger.error(`«${rule.name}»: выборка правила по времени`, err));
      }
    };
    /** Окно и лимит сообщений от правил: false — закрыто до конца прохода (за проход окно не откроется, лимит не вырастет). */
    let messaging: boolean | null = null;
    /** Сработало ли правило для объекта. */
    const fire = async (rule: AutomationRule, ctx: TriggerContext): Promise<boolean> => {
      if (!matches(rule, ctx)) return false;
      // «Забросил книгу», годовщина, праздник: сообщение — суть правила; вне окна или сверх суточного лимита объект не
      // застолбляем — сработает в следующем проходе (утром, завтра) целиком, с задачей и уведомлением. «Не ответили N
      // минут» и «дата события» не ждут: уведомление и задача — сейчас, сообщение sendAutomated пропустит с заметкой.
      if (waitsForMessaging(rule)) {
        if (messaging === false) return false;
        messaging = await this.effects.canMessageNow().catch((err) => (this.logger.error("правила по времени: окно и лимит сообщений", err), false));
        if (!messaging) return false;
      }
      const ok = await this.#depth
        .run(1, () => this.execute(rule, ctx))
        .catch((err) => {
          this.logger.error(`«${rule.name}»`, err);
          return false;
        });
      if (ok) fired++;
      return ok;
    };

    await each("message.unanswered", async (rule) => {
      const minutes = conditionNumber(rule, "minutes", 15);
      for (const c of await this.scheduled.unanswered(rule.id, new Date(now.getTime() - minutes * 60_000))) {
        // Ночь и выходные не считаем: норматив — в рабочих минутах.
        if ((await this.schedule.workMinutesBetween(c.awaitingSince, now)) < minutes) continue;
        await fire(rule, { subject: `${c.conversationId}:${c.awaitingSince.toISOString()}`, conversationId: c.conversationId, dealId: c.dealId, clientId: c.clientId, channel: c.channel, workTime });
      }
    });

    if (!opts.force && now.getTime() - this.#lastSlowRun < 30 * 60_000) return fired;
    this.#lastSlowRun = now.getTime();

    // Журнал: отложенные сообщения событийных правил и чистка подробностей старше 90 дней.
    await this.resendDeferred(now).catch((err) => this.logger.error("правила: отложенные сообщения", err));
    await this.rules.purgeDetails(new Date(now.getTime() - RUN_DETAILS_KEEP_DAYS * 86_400_000), 500).catch((err) => this.logger.error("правила: чистка журнала", err));

    await each("client.inactive", async (rule) => {
      for (const r of await this.scheduled.inactiveClients(rule.id, conditionNumber(rule, "days", 5))) {
        await fire(rule, { subject: `${r.dealId}:${r.lastSeen.toISOString()}`, dealId: r.dealId, clientId: r.clientId, workTime });
      }
    });
    await each("occasion.anniversary", async (rule) => {
      // Сделка «Повторная продажа», задача и уведомление менеджеру — не ночью: ночью круг сделки не раздаёт, и они
      // остались бы ничьими. Кандидаты держатся все daysBefore дней — сработают в начале смены.
      if (!workTime) return;
      const q = anniversaryQuery(rule);
      for (const r of await this.scheduled.anniversaries(rule.id, zonedDay(now), q.daysBefore, q.repurchaseDays)) {
        // Сделка из чата — не объект правила: она выиграна, повторная продажа — новая сделка («Создать сделку»).
        const subject = r.orderId ? `${r.orderId}:${r.year}` : `deal:${r.dealId}:${r.year}`;
        await fire(rule, { subject, orderId: r.orderId, clientId: r.clientId, workTime, occasion: r.occasion, date: r.date, clientVars: r.client, recipient: r.recipient });
      }
    });
    await each("deal.event_date_near", async (rule) => {
      // «Только в рабочее время» вне его — выборку не делаем: кандидаты всё равно не сработают до утра.
      if (!matches(rule, { subject: "", workTime })) return;
      for (const r of await this.scheduled.eventDates(rule.id, eventDateQuery(rule, zonedDay(now)))) {
        await fire(rule, { subject: eventDateSubject(r.dealId, r.eventDate), dealId: r.dealId, clientId: r.clientId, workTime, occasion: r.occasion, date: r.date, clientVars: r.client });
      }
    });
    await each("deal.idle", async (rule) => {
      // Задача менеджеру: «только в рабочее время» вне его выборку не делаем — сделки сработают утром.
      if (!inRuleHours(rule, workTime)) return;
      const q = idleQuery(rule, now);
      // Не больше perDay сделок в день: счёт за сегодня — из журнала (перезапуск процесса лимит не обнуляет).
      let left = q.perDay - (await this.scheduled.firedOn(rule.id, zonedDay(now)));
      if (left <= 0) return;
      for (const r of await this.scheduled.idleDeals(rule.id, { before: q.before, stageId: q.stageId, limit: left })) {
        if (left <= 0) break;
        const ctx = { subject: idleSubject(r.dealId, r.lastActivity), dealId: r.dealId, clientId: r.clientId, stageId: r.stageId, workTime, date: r.date };
        if (await fire(rule, ctx)) left--;
      }
    });
    await each("message.silent", async (rule) => {
      // Задача менеджеру: «только в рабочее время» вне его выборку не делаем — диалоги сработают утром.
      if (!inRuleHours(rule, workTime)) return;
      for (const c of await this.scheduled.silent(rule.id, silentQuery(rule, now))) {
        const ctx = { subject: silentSubject(c.conversationId, c.lastOutgoingAt), conversationId: c.conversationId, dealId: c.dealId, clientId: c.clientId, channel: c.channel, workTime, date: c.date };
        await fire(rule, ctx);
      }
    });
    await this.holidayRules(rules, now, workTime, fire);
    return fired;
  }

  /**
   * «Приближается праздник» (bots-10): покупатели прошлого года к празднику из списка, до которого 0…daysBefore дней.
   * Раз в день, в рабочее время (задачи и уведомления — не ночью), не больше perDay клиентов на правило: счёт
   * срабатываний за сегодня — из журнала, так что перезапуск процесса лимит не обнуляет. Выборка идёт, только пока
   * праздник близко; после прохода — до завтра не повторяется (кандидаты кончились или лимит дня выбран).
   */
  private async holidayRules(rules: AutomationRule[], now: Date, workTime: boolean, fire: (rule: AutomationRule, ctx: TriggerContext) => Promise<boolean>) {
    const holidayRules = rules.filter((r) => r.trigger === "occasion.holiday");
    if (!holidayRules.length || !workTime) return;
    const today = zonedDay(now);
    let list;
    try {
      list = await this.holidays.list();
    } catch (err) {
      this.logger.error("правила по времени: список праздников", err);
      return;
    }
    for (const rule of holidayRules) {
      if (this.#holidayDone.get(rule.id) === today) continue;
      const daysBefore = conditionNumber(rule, "daysBefore", HOLIDAY_DEFAULTS.daysBefore, HOLIDAY_LIMITS.daysBefore);
      const windowDays = conditionNumber(rule, "windowDays", HOLIDAY_DEFAULTS.windowDays, HOLIDAY_LIMITS.windowDays);
      const upcoming = upcomingHolidays(list, today, daysBefore, rule.conditions?.holiday ? String(rule.conditions.holiday) : null);
      if (!upcoming.length) continue;
      try {
        let left = conditionNumber(rule, "perDay", HOLIDAY_DEFAULTS.perDay, HOLIDAY_LIMITS.perDay) - (await this.scheduled.firedOn(rule.id, today));
        for (const u of upcoming) {
          if (left <= 0) break;
          for (const r of await this.scheduled.holidayBuyers(rule.id, { holiday: u.holiday, date: u.date, ...holidayWindows(u, windowDays, daysBefore), limit: left })) {
            const ctx = { subject: `holiday:${u.holiday.id}:${u.year}:${r.clientId}`, clientId: r.clientId, workTime, occasion: r.occasion, date: r.date, clientVars: r.client };
            if (await fire(rule, ctx)) left--;
          }
        }
        this.#holidayDone.set(rule.id, today);
      } catch (err) {
        this.logger.error(`«${rule.name}»: выборка правила по времени`, err);
      }
    }
  }
}
