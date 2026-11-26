"use server";

import { revalidatePath } from "next/cache";
import { DESIGN_AI_FREE_LIMIT_MAX, DESIGN_MODEL_TIERS, DESIGN_SCENARIOS, type DesignModelTier } from "@/lib/book/design-ai";
import { saveSettings } from "@/modules/workspace";
import { assertStaff, audit } from "@/server/access";
import { addDesignAiCredits, designAiFreeLimit } from "@/server/designAiStore";
import { BAD_FORM, textForm } from "@/server/input";

export interface AiDesignerState {
  error?: string;
  ok?: string;
}

/** Максимум запросов, которые можно начислить клиенту за один раз. */
const MAX_GRANT = 200;

const whole = (form: FormData, name: string) => {
  const raw = String(form.get(name) ?? "").replace(/\s/g, "");
  return /^\d{1,4}$/.test(raw) ? Number(raw) : null;
};

/** Сколько бесплатных запросов к ИИ-дизайнеру получает каждый клиент за всё время; действует сразу и для тех, кто уже пользовался. */
export async function saveFreeLimitAction(_: AiDesignerState, form: FormData): Promise<AiDesignerState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const n = whole(form, "limit");
  if (n === null || n > DESIGN_AI_FREE_LIMIT_MAX) return { error: `Укажите целое число от 0 до ${DESIGN_AI_FREE_LIMIT_MAX}` };
  const before = await designAiFreeLimit();
  await saveSettings({ "designAi.freeLimit": String(n) }, staff.user.id);
  await audit(staff, "designAi.freeLimit", "settings", "designAi.freeLimit", { before, after: n });
  revalidatePath("/admin/ai-designer");
  return { ok: n === 0 ? "Бесплатных запросов больше нет — только купленные." : `Готово: ${n} бесплатных запросов на клиента.` };
}

/** Подарить клиенту запросы сверх лимита: они ложатся на его баланс, как купленные, и не сгорают. */
export async function grantCreditsAction(_: AiDesignerState, form: FormData): Promise<AiDesignerState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const userId = String(form.get("userId") ?? "");
  const n = whole(form, "count");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { error: BAD_FORM };
  if (n === null || n < 1 || n > MAX_GRANT) return { error: `От 1 до ${MAX_GRANT}` };
  await addDesignAiCredits(userId, n);
  await audit(staff, "designAi.grant", "user", userId, { requests: n });
  revalidatePath("/admin/ai-designer");
  return { ok: `+${n}` };
}

/**
 * Настройки ИИ-дизайнера: включён ли, какая модель в каком сценарии, свои id моделей и осмотр картинкой. Действуют сразу.
 * Пустой id модели — по умолчанию; уровень по умолчанию — тоже пустое значение (чтобы смена кода не оставляла старый выбор).
 */
export async function saveDesignerSettingsAction(_: AiDesignerState, form: FormData): Promise<AiDesignerState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const values: Record<string, string> = { "designAi.enabled": form.get("enabled") === "on" ? "on" : "off", "designAi.polish": form.get("polish") === "on" ? "on" : "off" };
  for (const scenario of DESIGN_SCENARIOS) {
    const tier = String(form.get(`tier_${scenario}`) ?? "");
    if (!DESIGN_MODEL_TIERS.includes(tier as DesignModelTier)) return { error: "Выберите модель для каждого сценария" };
    values[`designAi.tier.${scenario}`] = tier;
  }
  for (const tier of DESIGN_MODEL_TIERS) {
    const id = String(form.get(`model_${tier}`) ?? "").trim();
    if (id && !/^[\w.:/-]{3,80}$/.test(id)) return { error: "Идентификатор модели — латиница, цифры и . : / - _" };
    values[`designAi.model.${tier}`] = id;
  }
  await saveSettings(values as never, staff.user.id);
  await audit(staff, "designAi.settings", "settings", "designAi", values);
  revalidatePath("/admin/ai-designer");
  return { ok: "Сохранено — действует со следующего запроса." };
}
