import { AsyncLocalStorage } from "node:async_hooks";
import type { Clock, Logger } from "@/shared/application";
import { conditionNumber, fillTemplate, linkFor, matches, needsWorkTime, triggerLabel, type AutomationRule, type AutomationTrigger, type RuleAction, type RuleSubject, type TriggerContext } from "../domain";
import type { AppInfo, AutomationEffects, RuleRepository, SalesGateway, ScheduledSource, SubjectLoader, WorkSchedule } from "./ports";

/** Защита от зацикливания: правило двигает сделку → срабатывает правило на этап → … */
const MAX_DEPTH = 3;

/**
 * Движок «цифровой воронки»: событие → правила с подходящими условиями → действия.
 * Каждое правило срабатывает для объекта один раз; ошибка одного правила не мешает остальным.
 */
export class AutomationEngine {
  readonly #depth = new AsyncLocalStorage<number>();
  #lastSlowRun = 0;

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
        await this.execute(rule, ctx).catch((err) => this.logger.error(`«${rule.name}»`, err));
      }
    });
  }

  private async execute(rule: AutomationRule, ctx: TriggerContext): Promise<boolean> {
    if (!(await this.rules.claim(rule.id, ctx.subject.slice(0, 200)))) return false;
    const subject = await this.subjects.load(ctx);
    for (const action of rule.actions ?? []) await this.perform(rule, action, ctx, subject);
    await this.rules.markRun(rule.id, this.clock.now());
    return true;
  }

  private async vars(ctx: TriggerContext, s: RuleSubject) {
    return {
      name: s.name,
      order: s.orderNumber ?? null,
      link: this.app.url,
      manager: await this.subjects.managerName(s.assigneeId),
      occasion: ctx.occasion ?? "",
      date: ctx.date ?? "",
      fields: s.deal ? await this.subjects.dealFieldVars(s.deal.customFields) : {},
    };
  }

  private async perform(rule: AutomationRule, a: RuleAction, ctx: TriggerContext, s: RuleSubject) {
    const vars = await this.vars(ctx, s);
    switch (a.type) {
      case "create_task": {
        const assigneeId = a.userId || s.deal?.assigneeId || s.assigneeId;
        const title = fillTemplate(a.title || rule.name, vars) || rule.name;
        await this.effects.createTask({
          title: title.slice(0, 200),
          kind: ctx.callId ? "call" : ctx.conversationId ? "message" : "task",
          dueAt: new Date(this.clock.now().getTime() + (a.dueMinutes ?? 60) * 60_000),
          clientId: s.clientId,
          dealId: s.deal?.id ?? null,
          orderId: ctx.orderId ?? null,
          assigneeId,
        });
        await this.effects.notify(assigneeId ? [assigneeId] : "staff", { kind: "task", title: `Задача: ${title}`, body: rule.name, link: linkFor(ctx, s) ?? "/admin/tasks" });
        return;
      }
      case "send_message": {
        const text = fillTemplate(a.text ?? "", vars);
        if (!text) return;
        const convId = s.conversation?.id ?? (await this.subjects.latestConversation(s.deal?.id ?? null, s.clientId));
        if (convId) await this.effects.sendMessage(convId, text);
        return;
      }
      case "assign": {
        const userId = a.userId || (await this.sales.nextRoundRobin());
        if (!userId) return;
        if (s.deal && !s.deal.assigneeId) await this.sales.assign(s.deal.id, userId);
        if (s.conversation && !s.conversation.assigneeId) await this.effects.assignConversation(s.conversation.id, userId);
        s.assigneeId = s.assigneeId ?? userId;
        return;
      }
      case "move_stage": {
        if (s.deal && a.stageId) await this.sales.move(s.deal.id, a.stageId);
        return;
      }
      case "create_deal": {
        if (s.deal || !s.clientId) return; // открытая сделка уже есть — работаем в ней
        const open = await this.sales.findOpenDealId(s.clientId);
        if (open) {
          s.deal = (await this.subjects.load({ subject: "", dealId: open })).deal;
          return;
        }
        const client = await this.subjects.clientContact(s.clientId);
        if (!client) return;
        const deal = await this.sales.createDeal({
          title: fillTemplate(a.title || rule.name, vars) || rule.name,
          source: rule.trigger === "occasion.anniversary" ? "repeat" : "manual",
          clientId: s.clientId,
          contactName: client.name,
          contactPhone: client.phone,
          contactEmail: client.email,
          assigneeId: a.userId || client.managerId || null,
        });
        s.deal = (await this.subjects.load({ subject: "", dealId: deal.id })).deal;
        s.assigneeId = s.assigneeId ?? deal.assigneeId;
        return;
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
        return;
      }
    }
  }

  /**
   * Правила по времени. «Клиенту не ответили N минут» — каждый проход, считая только рабочее время;
   * «клиент забросил книгу» и «годовщина повода» — раз в 30 минут (force — сразу, для scheduler:once).
   */
  async runScheduled(opts: { force?: boolean } = {}) {
    const rules = await this.rules.active();
    if (!rules.length) return 0;
    const now = this.clock.now();
    const workTime = await this.schedule.isWorkTime(now);
    let fired = 0;
    const fire = async (rule: AutomationRule, ctx: TriggerContext) => {
      if (!matches(rule, ctx)) return;
      const ok = await this.#depth
        .run(1, () => this.execute(rule, ctx))
        .catch((err) => {
          this.logger.error(`«${rule.name}»`, err);
          return false;
        });
      if (ok) fired++;
    };

    for (const rule of rules.filter((r) => r.trigger === "message.unanswered")) {
      const minutes = conditionNumber(rule, "minutes", 15);
      for (const c of await this.scheduled.unanswered(new Date(now.getTime() - minutes * 60_000))) {
        // Ночь и выходные не считаем: норматив — в рабочих минутах.
        if ((await this.schedule.workMinutesBetween(c.awaitingSince, now)) < minutes) continue;
        await fire(rule, { subject: `${c.conversationId}:${c.awaitingSince.toISOString()}`, conversationId: c.conversationId, dealId: c.dealId, clientId: c.clientId, channel: c.channel, workTime });
      }
    }

    if (!opts.force && now.getTime() - this.#lastSlowRun < 30 * 60_000) return fired;
    this.#lastSlowRun = now.getTime();

    for (const rule of rules.filter((r) => r.trigger === "client.inactive")) {
      for (const r of await this.scheduled.inactiveClients(conditionNumber(rule, "days", 5))) {
        await fire(rule, { subject: `${r.dealId}:${r.lastSeen.toISOString()}`, dealId: r.dealId, clientId: r.clientId, workTime });
      }
    }
    for (const rule of rules.filter((r) => r.trigger === "occasion.anniversary")) {
      for (const r of await this.scheduled.anniversaries(conditionNumber(rule, "daysBefore", 30, 120))) {
        await fire(rule, { subject: `${r.orderId}:${r.year}`, orderId: r.orderId, clientId: r.clientId, workTime, occasion: r.occasion, date: r.date });
      }
    }
    return fired;
  }
}
