"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { container } from "@/server/container";
import { assertStaff, audit } from "@/server/access";
import { automationTriggers, orderRuleStatuses } from "@/modules/automation/domain/meta";
import { HOLIDAY_LIMITS } from "@/modules/automation/domain";
import { dealSources } from "@/shared/domain/dealSources";

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
    minutes: z.coerce.number().int().min(1).max(1440).optional(),
    days: z.coerce.number().int().min(1).max(90).optional(),
    daysBefore: z.coerce.number().int().min(1).max(HOLIDAY_LIMITS.daysBefore).optional(),
    windowDays: z.coerce.number().int().min(1, "Покупки к празднику — хотя бы за 1 день").max(HOLIDAY_LIMITS.windowDays, `Покупки к празднику — не больше чем за ${HOLIDAY_LIMITS.windowDays} дней`).optional(),
    perDay: z.coerce.number().int().min(1, "Клиентов в день — от 1").max(HOLIDAY_LIMITS.perDay, `Клиентов в день — не больше ${HOLIDAY_LIMITS.perDay}`).optional(),
    holiday: z.union([z.string().trim().regex(/^[a-z0-9-]{1,30}$/), z.literal(""), z.null()]).optional(),
    hours: z.union([z.enum(["work", "off"]), z.literal("any"), z.literal(""), z.null()]).optional(),
  }),
  actions: z.array(actionSchema).min(1, "Добавьте хотя бы одно действие").max(6),
  active: z.boolean().default(true),
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

export async function deleteAutomationAction(id: string) {
  const staff = await assertStaff("settings.manage");
  const a = await container().automation.rules.delete(uuid.parse(id));
  if (a) await audit(staff, "automation.delete", "automation", id, { name: a.name });
  revalidatePath("/admin/automations");
}
