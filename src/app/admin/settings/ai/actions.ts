"use server";

import { container } from "@/server/container";
import { revalidatePath } from "next/cache";
import { assertStaff, audit } from "@/server/access";
import { fromEnv, getSetting, getSettings, saveSettings } from "@/modules/workspace";
import { parseBotConfig } from "@/modules/messaging/domain/botConfig";
import { AssistantError, isAiProvider, providerSettingKeys, type AiProvider } from "@/modules/assistant";
import { z } from "zod";
import { BAD_FORM, formText, textForm } from "@/server/input";
import type { SettingsState } from "../state";
import { apiUrl, modelName, parseForm, secretValue, unlessEnv } from "../form-kit";
import { botPriceDrift, botPriceWarning } from "@/server/bot-prices";

// ─── AI-помощник ───────────────────────────────────────────────────────────

/** Форма AI-помощника. Провайдер проверяется отдельно: из переменной окружения он не меняется. */
const aiForm = z.object({
  provider: z.string().default("anthropic"),
  aiBaseUrl: formText.transform((v) => v.trim().replace(/\/+$/, "")).pipe(apiUrl),
  aiModel: modelName,
  knowledge: formText.transform((v) => v.trim()),
});

export async function saveAiAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const provider = fromEnv("ai.provider") ? null : String(form.get("provider") ?? "anthropic");
  if (provider !== null && !isAiProvider(provider)) return { error: "Выберите провайдера" };
  const parsed = parseForm(aiForm, form);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { aiBaseUrl: baseUrl, aiModel: model, knowledge } = parsed.data;
  const p: AiProvider = provider ?? ((await getSettings(["ai.provider"]))["ai.provider"] as AiProvider);
  const keys = providerSettingKeys[isAiProvider(p) ? p : "anthropic"];
  if (p === "custom" && (!(baseUrl || fromEnv(keys.baseUrl)) || !model)) return { error: "Для своего сервера укажите адрес API и модель" };
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
  // Сумма из базы знаний — разрешённая для бота: старая цена ушла бы клиенту (deals-d13). Сохраняем, но предупреждаем.
  const warning = botPriceWarning(await botPriceDrift({ knowledge, faq: false }).catch(() => [])) ?? undefined;
  return { ok: "Сохранено", ...(warning ? { warning } : {}) };
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

/** Форма AI-корректора: провайдер ("" — как у помощника) и модель. */
const proofreadForm = z.object({
  provider: formText.refine((v) => !v || isAiProvider(v), "Выберите провайдера"),
  model: modelName,
});

export async function saveProofreadAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = parseForm(proofreadForm, form);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { provider, model } = parsed.data;
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

// ─── модель AI-продажника бота ─────────────────────────────────────────────

const sellerForm = z.object({
  provider: formText.refine((v) => !v || isAiProvider(v), "Выберите провайдера"),
  model: modelName,
});

export async function saveSellerAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = parseForm(sellerForm, form);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { provider, model } = parsed.data;
  // Ключ вводится здесь же для выбранного провайдера — тот же, что у помощника (хранится один раз).
  const keyFor = isAiProvider(provider) ? provider : (await container().assistant.sellerProvider()).provider;
  await saveSettings({ "seller.provider": provider, "seller.model": model, ...secretValue(form, "key", providerSettingKeys[keyFor].apiKey) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "seller", { provider: provider || "assistant", model: model || null });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

// ─── распознавание голосовых и фото для AI-продажника ───────────────────────

const mediaForm = z.object({
  provider: formText.refine((v) => !v || isAiProvider(v), "Выберите провайдера"),
  model: modelName,
});

export async function saveMediaAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = parseForm(mediaForm, form);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { provider, model } = parsed.data;
  if (provider === "deepseek") return { error: "DeepSeek не понимает голосовые и фото — выберите OpenRouter, Claude или OpenAI." };
  const keyFor = isAiProvider(provider) ? provider : (await container().assistant.mediaProvider()).provider;
  await saveSettings({ "media.provider": provider, "media.model": model, ...secretValue(form, "key", providerSettingKeys[keyFor].apiKey) }, staff.user.id);
  await audit(staff, "settings.update", "settings", "media", { provider: provider || "seller", model: model || null });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

/** Пробный диалог на сохранённой модели: настоящий ход продажника с сохранёнными настройками бота (без отправки клиенту). */
export async function testSellerAction(): Promise<{ ok: boolean; message: string }> {
  await assertStaff("settings.manage");
  const seller = container().assistant.seller;
  if (!(await seller.configured())) return { ok: false, message: "Модель не подключена: добавьте ключ провайдера." };
  const { label, model } = await seller.describe();
  try {
    const t0 = Date.now();
    const config = parseBotConfig(await getSetting("bot.config"));
    const result = await container().messaging.previewBot({
      config: { ...config, sell: { ...config.sell, on: true, engine: "ai" } },
      turns: [[{ text: "Здравствуйте! Сколько стоит печатная книга для мамы?", type: "text" }]],
      workTime: true,
      client: "new",
      name: "Айгерим",
    });
    const took = ((Date.now() - t0) / 1000).toFixed(1);
    const reply = result.transcript.find((m) => m.from === "bot" && m.text)?.text;
    if (result.engine !== "ai") return { ok: false, message: "Продажник не запустился на модели (проверьте ключ и модель)." };
    if (!reply || reply.startsWith("⚠️")) return { ok: false, message: reply ?? "Модель не ответила по схеме — попробуйте другую модель (нужна поддержка JSON-ответа)." };
    return { ok: true, message: `${label === "AI" ? model : `${label} · ${model}`} ответила за ${took} с: «${reply.slice(0, 280)}»` };
  } catch (err) {
    return { ok: false, message: AssistantError.is(err) ? err.message : "Не удалось связаться с AI-сервисом" };
  }
}
