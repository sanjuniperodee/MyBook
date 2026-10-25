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
      "ai.autofill": form.get("autofill") === "on" ? "on" : "off",
      "ai.knowledge": knowledge,
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "ai", { provider: p, model: model || null, enabled: form.get("enabled") === "on", autofill: form.get("autofill") === "on", knowledge: knowledge.length });
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

/** Лимит на клиента из поля формы: целое от 1 до 1000. */
function limit(label: string, fallback: string) {
  return formText.transform((v) => v.trim() || fallback).refine((v) => /^\d{1,4}$/.test(v) && Number(v) >= 1 && Number(v) <= 1000, `${label}: целое число от 1 до 1000`);
}

// ─── проверка текста в редакторе (AI-корректор) ────────────────────────────

/** Форма AI-корректора: провайдер ("" — как у помощника) и модель. */
const proofreadForm = z.object({
  provider: formText.refine((v) => !v || isAiProvider(v), "Выберите провайдера"),
  model: modelName,
  perTenMin: limit("Проверок за 10 минут", "10"),
  perDay: limit("Проверок в сутки", "80"),
});

export async function saveProofreadAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = parseForm(proofreadForm, form);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { provider, model, perTenMin, perDay } = parsed.data;
  // Ключ вводится здесь же для выбранного провайдера — тот же, что у помощника (хранится один раз).
  const keyFor = isAiProvider(provider) ? provider : (await container().assistant.proofreadProvider()).provider;
  await saveSettings(
    {
      "proofread.provider": provider,
      "proofread.model": model,
      "proofread.enabled": form.get("enabled") === "on" ? "on" : "off",
      "proofread.perTenMin": perTenMin,
      "proofread.perDay": perDay,
      ...secretValue(form, "key", providerSettingKeys[keyFor].apiKey),
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "proofread", { provider: provider || "assistant", model: model || null, enabled: form.get("enabled") === "on", perTenMin, perDay });
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

// ─── AI-помощник при письме у клиента ──────────────────────────────────────

/** Форма AI-помощника при письме: провайдер ("" — как у корректора), модель ("" — как у корректора) и лимиты на клиента. */
const writerForm = z.object({
  provider: formText.refine((v) => !v || isAiProvider(v), "Выберите провайдера"),
  model: modelName,
  perTenMin: limit("Запросов за 10 минут", "10"),
  perDay: limit("Запросов в сутки", "60"),
});

export async function saveWriterAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = parseForm(writerForm, form);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { provider, model, perTenMin, perDay } = parsed.data;
  const keyFor = isAiProvider(provider) ? provider : (await container().assistant.writerProvider()).provider;
  await saveSettings(
    {
      "writer.provider": provider,
      "writer.model": model,
      // Сохранённый флажок отвязывает помощника от корректора: дальше он включается и выключается сам.
      "writer.enabled": form.get("enabled") === "on" ? "on" : "off",
      "writer.perTenMin": perTenMin,
      "writer.perDay": perDay,
      ...secretValue(form, "key", providerSettingKeys[keyFor].apiKey),
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "writer", { provider: provider || "proofread", model: model || null, enabled: form.get("enabled") === "on", perTenMin, perDay });
  revalidatePath("/admin/settings");
  return { ok: "Сохранено" };
}

export async function testWriterAction(): Promise<{ ok: boolean; message: string }> {
  await assertStaff("settings.manage");
  const writer = container().assistant.writer;
  const { label, model } = await writer.describe();
  try {
    const t0 = Date.now();
    const out = await writer.rewrite("Мама очень любила готовить. Она готовила всегда по воскресеньям и мы все собирались за столом.", "improve", "ru");
    const took = ((Date.now() - t0) / 1000).toFixed(1);
    return { ok: true, message: `${label} · ${model} ответил за ${took} с: «${out.slice(0, 200)}»` };
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

// ─── маршрутизация модели AI-продажника ────────────────────────────────────

const number = (min: number, max: number) => formText.transform((v) => v.trim()).refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), `Число от ${min} до ${max}`);
const dollars = formText.transform((v) => v.trim().replace(",", ".")).refine((v) => !v || /^\d+(?:\.\d+)?$/.test(v), "Сумма в долларах, например 0.5 (0 — без потолка)");
const routingForm = z.object({
  mode: z.enum(["on", "shadow", "off"]).default("on"),
  defaultTier: z.enum(["haiku", "sonnet", "opus"]).default("haiku"),
  model_haiku: modelName,
  model_sonnet: modelName,
  model_opus: modelName,
  sonnetAt: number(1, 20),
  opusAt: number(2, 30),
  maxExtra: number(0, 4),
  budget: dollars,
  dailyBudget: dollars,
  prices: formText.transform((v) => v.trim()),
});

export async function saveRoutingAction(_: SettingsState, form: FormData): Promise<SettingsState> {
  const staff = await assertStaff("settings.manage");
  const parsed = parseForm(routingForm, form);
  if (parsed.error !== undefined) return { error: parsed.error };
  const d = parsed.data;
  if (d.prices) {
    try {
      const v: unknown = JSON.parse(d.prices);
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    } catch {
      return { error: "Прайс — JSON-объект: { \"модель\": { \"input\": 0.1, \"output\": 0.5 } }" };
    }
  }
  if (d.sonnetAt && d.opusAt && Number(d.opusAt) <= Number(d.sonnetAt)) return { error: "Порог Opus должен быть выше порога Sonnet" };
  // Запасные — только не-Claude провайдеры, по порядку списка.
  const fallbacks = form.getAll("fallback").map(String).filter((p) => isAiProvider(p) && p !== "anthropic");
  await saveSettings(
    {
      ...unlessEnv("seller.route", d.mode),
      ...unlessEnv("seller.route.default", d.defaultTier),
      ...unlessEnv("seller.route.haiku", d.model_haiku),
      ...unlessEnv("seller.route.sonnet", d.model_sonnet),
      ...unlessEnv("seller.route.opus", d.model_opus),
      ...unlessEnv("seller.route.sonnetAt", d.sonnetAt),
      ...unlessEnv("seller.route.opusAt", d.opusAt),
      ...unlessEnv("seller.route.maxExtra", d.maxExtra),
      ...unlessEnv("seller.route.budget", d.budget),
      ...unlessEnv("seller.route.dailyBudget", d.dailyBudget),
      ...unlessEnv("seller.route.prices", d.prices),
      ...unlessEnv("seller.fallbacks", fallbacks.join(",")),
    },
    staff.user.id,
  );
  await audit(staff, "settings.update", "settings", "seller.route", { mode: d.mode, defaultTier: d.defaultTier, fallbacks });
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
