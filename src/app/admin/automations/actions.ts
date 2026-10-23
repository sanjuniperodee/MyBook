"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { container } from "@/server/container";
import { assertStaff, audit } from "@/server/access";
import { automationTriggers, orderRuleStatuses } from "@/modules/automation/domain/meta";
import { EVENT_DATE_LIMITS, HOLIDAY_LIMITS, IDLE_LIMITS, isStaffOnlyTrigger, SILENT_LIMITS } from "@/modules/automation/domain";
import { dealSources } from "@/shared/domain/dealSources";
import type { RetryResult } from "@/modules/automation";
import { admin } from "@/i18n/admin";

const optUuid = z.union([uuid, z.literal(""), z.null()]).transform((v) => v || null);

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_task"), title: z.string().trim().min(1, "Текст задачи").max(200), dueMinutes: z.coerce.number().int().min(0).max(60 * 24 * 30), userId: optUuid.optional() }),
  z.object({ type: z.literal("send_message"), text: z.string().trim().min(1, "Текст сообщения").max(2000), textKk: z.string().trim().max(2000).optional() }),
  z.object({ type: z.literal("assign"), userId: optUuid.optional() }),
  z.object({ type: z.literal("move_stage"), stageId: uuid }),
  z.object({ type: z.literal("create_deal"), title: z.string().trim().max(200).optional(), userId: optUuid.optional() }),
  z.object({ type: z.literal("draft_message"), text: z.string().trim().min(1, "Текст клиенту").max(2000), textKk: z.string().trim().max(2000).optional() }),
  z.object({ type: z.literal("notify"), title: z.string().trim().max(120).optional(), text: z.string().trim().max(500).optional(), userId: optUuid.optional() }),
]);

const schema = z.object({
  id: optUuid.optional(),
  name: z.string().trim().min(2, "Название правила").max(100),
  trigger: z.enum(Object.keys(automationTriggers) as [keyof typeof automationTriggers, ...(keyof typeof automationTriggers)[]]),
  conditions: z.object({
    stageId: optUuid.optional(),
    source: z.union([z.enum(dealSources), z.literal(""), z.null()]).optional(),
    channel: z.string().trim().max(30).optional(),
    orderStatus: z.union([z.enum(orderRuleStatuses), z.literal(""), z.null()]).optional(),
    minutes: z.coerce.number({ error: admin.minutesInvalid(1440) }).int(admin.minutesInvalid(1440)).min(1, admin.minutesInvalid(1440)).max(1440, admin.minutesInvalid(1440)).optional(),
    // «Клиент забросил книгу» и «Сделка без активности»: сколько дней.
    days: z.coerce.number({ error: admin.daysInvalid(IDLE_LIMITS.days) }).int(admin.daysInvalid(IDLE_LIMITS.days)).min(1, admin.daysInvalid(IDLE_LIMITS.days)).max(IDLE_LIMITS.days, admin.daysInvalid(IDLE_LIMITS.days)).optional(),
    daysBefore: z.coerce
      .number({ error: admin.daysBeforeInvalid(HOLIDAY_LIMITS.daysBefore) })
      .int(admin.daysBeforeInvalid(HOLIDAY_LIMITS.daysBefore))
      .min(1, admin.daysBeforeInvalid(HOLIDAY_LIMITS.daysBefore))
      .max(HOLIDAY_LIMITS.daysBefore, admin.daysBeforeInvalid(HOLIDAY_LIMITS.daysBefore))
      .optional(),
    // «Праздник»: за сколько дней до него покупали год назад; «Годовщина»: покупка с какого дня — уже покупка к ней снова.
    windowDays: z.coerce
      .number({ error: admin.windowDaysInvalid(HOLIDAY_LIMITS.windowDays) })
      .int(admin.windowDaysInvalid(HOLIDAY_LIMITS.windowDays))
      .min(1, admin.windowDaysInvalid(HOLIDAY_LIMITS.windowDays))
      .max(HOLIDAY_LIMITS.windowDays, admin.windowDaysInvalid(HOLIDAY_LIMITS.windowDays))
      .optional(),
    perDay: z.coerce.number({ error: admin.perDayInvalid(HOLIDAY_LIMITS.perDay) }).int(admin.perDayInvalid(HOLIDAY_LIMITS.perDay)).min(1, admin.perDayInvalid(HOLIDAY_LIMITS.perDay)).max(HOLIDAY_LIMITS.perDay, admin.perDayInvalid(HOLIDAY_LIMITS.perDay)).optional(),
    holiday: z.union([z.string().trim().regex(/^[a-z0-9-]{1,30}$/), z.literal(""), z.null()]).optional(),
    hours: z.union([z.enum(["work", "off"]), z.literal("any"), z.literal(""), z.null()]).optional(),
    // «Успеть к дате»: порог заполненности книги (пусто — не проверять) и «ничего не оплачено».
    bookBelow: z.union([z.null(), z.coerce.number({ error: admin.bookBelowInvalid }).int(admin.bookBelowInvalid).min(1, admin.bookBelowInvalid).max(100, admin.bookBelowInvalid)]).optional(),
    unpaid: z.union([z.literal(1), z.literal(0), z.null()]).optional(),
    // «Клиент молчит после нашего ответа»: сколько часов.
    silentHours: z.coerce
      .number({ error: admin.silentHoursInvalid(SILENT_LIMITS.hours) })
      .int(admin.silentHoursInvalid(SILENT_LIMITS.hours))
      .min(1, admin.silentHoursInvalid(SILENT_LIMITS.hours))
      .max(SILENT_LIMITS.hours, admin.silentHoursInvalid(SILENT_LIMITS.hours))
      .optional(),
  }),
  actions: z.array(actionSchema).min(1, "Добавьте хотя бы одно действие").max(6),
  active: z.boolean().default(true),
}).superRefine((d, ctx) => {
  const days = d.conditions.daysBefore;
  if (d.trigger === "deal.event_date_near" && days !== undefined && days > EVENT_DATE_LIMITS.daysBefore)
    ctx.addIssue({ code: "custom", path: ["conditions", "daysBefore"], message: admin.eventDateDaysInvalid(EVENT_DATE_LIMITS.daysBefore) });
  // Забытая сделка и замолчавший клиент: клиенту не пишем (решение владельца) — задача, уведомление или готовый текст.
  if (isStaffOnlyTrigger(d.trigger) && d.actions.some((a) => a.type === "send_message"))
    ctx.addIssue({ code: "custom", path: ["actions"], message: admin.staffOnlyNoMessage });
});

type AutomationInput = z.input<typeof schema>;

export async function saveAutomationAction(input: AutomationInput): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("settings.manage");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  await container().automation.rules.save({ id: d.id ?? null, name: d.name, trigger: d.trigger, conditions: d.conditions, actions: d.actions, active: d.active });
  await audit(staff, "automation.save", "automation", d.id ?? null, { name: d.name, trigger: d.trigger });
  revalidatePath("/admin/automations");
  return { ok: true, message: "Правило сохранено" };
}

export async function toggleAutomationAction(id: string, active: boolean) {
  const staff = await assertStaff("settings.manage");
  await container().automation.rules.setActive(uuid.parse(id), active);
  await audit(staff, "automation.save", "automation", id, { active });
  revalidatePath("/admin/automations");
}

const retryRefusal: Record<Exclude<RetryResult, "ok">, string> = {
  notFound: "Срабатывание не найдено или его подробности уже очищены",
  notFailed: "Срабатывание уже выполнено или выполняется",
  ruleOff: "Правило выключено — включите его, чтобы повторить",
};

/** «Повторить» срабатывание с ошибкой в журнале правила (automation-13). */
export async function retryAutomationRunAction(runId: string): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("settings.manage");
  const res = await container().automation.engine.retry(uuid.parse(runId));
  if (res !== "ok") return { ok: false, message: retryRefusal[res] };
  await audit(staff, "automation.save", "automation", runId, { retry: true });
  revalidatePath("/admin/automations");
  return { ok: true, message: "Повторено — итог в журнале" };
}

export async function deleteAutomationAction(id: string) {
  const staff = await assertStaff("settings.manage");
  const a = await container().automation.rules.delete(uuid.parse(id));
  if (a) await audit(staff, "automation.delete", "automation", id, { name: a.name });
  revalidatePath("/admin/automations");
}
