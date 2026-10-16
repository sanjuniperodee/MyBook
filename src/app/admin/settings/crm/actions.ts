"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, audit } from "@/server/access";
import { saveSettings } from "@/modules/workspace";
import { isValidTime } from "@/shared/domain/schedule";
import type { SettingsState } from "../state";

export async function saveCrmSettingsAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = z
    .object({
      slaMinutes: z.coerce.number().int().min(1, "Норматив ответа — от 1 минуты").max(1440),
      from: z.string().refine(isValidTime, "Время начала в формате ЧЧ:ММ"),
      to: z.string().refine(isValidTime, "Время окончания в формате ЧЧ:ММ"),
      autoDealFrom: z.enum(["off", "registered", "book_started", "book_half", "book_ready"]),
      maxDiscount: z.coerce.number().int().min(0).max(50, "Скидка из чата — не больше 50%"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const days = form.getAll("days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (!days.length) return { error: "Выберите хотя бы один рабочий день" };
  const d = parsed.data;
  await saveSettings(
    {
      "crm.slaMinutes": String(d.slaMinutes),
      "crm.workHours": JSON.stringify({ days: [...new Set(days)].sort(), from: d.from, to: d.to }),
      "crm.autoDealFrom": d.autoDealFrom,
      "crm.unsorted": form.get("unsorted") === "on" ? "on" : "off",
      "crm.maxDiscount": String(d.maxDiscount),
      "widget.enabled": form.get("widgetEnabled") === "on" ? "on" : "off",
      "widget.chat": form.get("widgetChat") === "on" ? "on" : "off",
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "crm", { ...d, days });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

// ─── шаблоны ответов ───────────────────────────────────────────────────────

const templateSchema = z.object({
  id: z.union([z.literal(""), uuid]).default(""),
  title: z.string().trim().min(1, "Название шаблона").max(60),
  text: z.string().trim().min(1, "Текст шаблона").max(2000),
});

export async function saveTemplateAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  await assertStaff("settings.manage");
  const parsed = templateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, title, text } = parsed.data;
  if (id) await container().workspace.templates.update(id, { title, text });
  else await container().workspace.templates.add({ title, text });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function deleteTemplateAction(id: string) {
  await assertStaff("settings.manage");
  await container().workspace.templates.delete(uuid.parse(id));
  revalidatePath("/admin/settings");
}

const botSchema = z.object({
  mode: z.enum(["off", "always", "off_hours"]),
  greeting: z.string().trim().max(500),
  finish: z.string().trim().max(500),
  questions: z.array(z.object({ text: z.string().trim().min(1, "Текст вопроса").max(400), field: z.string().min(1, "Поле для ответа").max(40) })).max(6),
});

export async function saveBotAction(input: z.input<typeof botSchema>): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = botSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { mode, ...config } = parsed.data;
  if (mode !== "off" && !config.questions.length) return { error: "Добавьте хотя бы один вопрос" };
  await saveSettings({ "bot.mode": mode, "bot.config": JSON.stringify(config) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "bot", { mode, questions: config.questions.length });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}
