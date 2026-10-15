"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { assertStaff, audit } from "@/server/access";
import { fromEnv, getSettings, saveSettings } from "@/modules/workspace";
import { AssistantError, isAiProvider, providerSettingKeys, type AiProvider } from "@/modules/assistant";
import { BAD_FORM, textForm } from "@/server/input";
import type { SettingsState } from "../state";
import { secretValue, unlessEnv } from "../form-kit";

// ─── AI-помощник ───────────────────────────────────────────────────────────

export async function saveAiAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const provider = fromEnv("ai.provider") ? null : String(form.get("provider") ?? "anthropic");
  if (provider !== null && !isAiProvider(provider)) return { error: "Выберите провайдера" };
  const p: AiProvider = provider ?? ((await getSettings(["ai.provider"]))["ai.provider"] as AiProvider);
  const keys = providerSettingKeys[isAiProvider(p) ? p : "anthropic"];
  const baseUrl = String(form.get("aiBaseUrl") ?? "").trim().replace(/\/+$/, "");
  if (baseUrl && !/^https?:\/\/[^\s]+$/.test(baseUrl)) return { error: "Адрес API должен начинаться с https://" };
  const model = String(form.get("aiModel") ?? "").trim();
  if (model && !/^[\w.:/@-]{1,100}$/.test(model)) return { error: "Название модели — латиница, цифры и символы . : / - _" };
  if (p === "custom" && (!(baseUrl || fromEnv(keys.baseUrl)) || !model)) return { error: "Для своего сервера укажите адрес API и модель" };
  const knowledge = String(form.get("knowledge") ?? "").trim();
  if (knowledge.length > 6000) return { error: "База знаний — не больше 6000 символов" };
  await saveSettings(
    {
      ...(provider ? { "ai.provider": provider } : {}),
      ...secretValue(form, "aiKey", keys.apiKey),
      ...unlessEnv(keys.baseUrl, baseUrl),
      [keys.model]: model,
      "ai.enabled": form.get("enabled") === "on" ? "on" : "off",
      "ai.knowledge": knowledge,
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "ai", { provider: p, model: model || null, enabled: form.get("enabled") === "on", knowledge: knowledge.length });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function testAiAction(): Promise<{ ok: boolean; message: string }> {
  await assertStaff("settings.manage");
  const assistant = container().assistant.service;
  const { label, model } = await assistant.describe();
  try {
    const answer = await assistant.test();
    return { ok: true, message: `Подключено, ${label === "AI" ? `модель ${model}` : label} отвечает: «${answer}»` };
  } catch (err) {
    return { ok: false, message: AssistantError.is(err) ? err.message : "Не удалось связаться с AI-сервисом" };
  }
}

// ─── проверка текста в редакторе (AI-корректор) ────────────────────────────

export async function saveProofreadAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const provider = String(form.get("provider") ?? "");
  if (provider && !isAiProvider(provider)) return { error: "Выберите провайдера" };
  const model = String(form.get("model") ?? "").trim();
  if (model && !/^[\w.:/@-]{1,100}$/.test(model)) return { error: "Название модели — латиница, цифры и символы . : / - _" };
  // Ключ вводится здесь же для выбранного провайдера — тот же, что у помощника (хранится один раз).
  const keyFor = isAiProvider(provider) ? provider : (await container().assistant.proofreadProvider()).provider;
  await saveSettings(
    {
      "proofread.provider": provider,
      "proofread.model": model,
      "proofread.enabled": form.get("enabled") === "on" ? "on" : "off",
      ...secretValue(form, "key", providerSettingKeys[keyFor].apiKey),
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "proofread", { provider: provider || "assistant", model: model || null, enabled: form.get("enabled") === "on" });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function testProofreadAction(): Promise<{ ok: boolean; message: string }> {
  await assertStaff("settings.manage");
  const proofreader = container().assistant.proofreader;
  const { label, model } = await proofreader.describe();
  try {
    const t0 = Date.now();
    const fixes = await proofreader.test();
    const took = ((Date.now() - t0) / 1000).toFixed(1);
    return { ok: true, message: `${label} · ${model} отвечает за ${took} с. В проверочной фразе исправил: ${fixes || "ничего (слабая модель — попробуйте другую)"}` };
  } catch (err) {
    return { ok: false, message: AssistantError.is(err) ? err.message : "Не удалось связаться с AI-сервисом" };
  }
}
