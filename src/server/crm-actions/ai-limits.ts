import { assertStaff, audit } from "@/server/access";
import { BAD_FORM, textForm } from "@/server/input";
import {
  AI_LIMIT_MAX,
  AI_LONG_HOURS_MAX,
  AI_WINDOW_MIN_MAX,
  CLIENT_AI_TOOLS,
  clientAiLimits,
  resetClientAiUsage,
  saveClientAiLimits,
  saveUserAiOverride,
  userAiOverrides,
  type ClientAiLimit,
  type ClientAiTool,
  type UserAiOverride,
} from "@/server/clientAiLimits";
import { CLIENT_AI_TOOL_LABELS } from "@/lib/crm/ai-limits-labels";

export interface AiLimitsState {
  error?: string;
  ok?: string;
}

const isUserId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Целое из поля формы; "" — пусто (null), иначе число в границах или ошибка. */
function num(
  form: FormData,
  name: string,
  min: number,
  max: number,
): number | null | "bad" {
  const raw = String(form.get(name) ?? "").replace(/\s/g, "");
  if (!raw) return null;
  if (!/^\d{1,6}$/.test(raw)) return "bad";
  const n = Number(raw);
  return n >= min && n <= max ? n : "bad";
}

/** Общие лимиты: окна и число запросов по каждому помощнику. Действуют со следующего запроса клиента. */
export async function saveGlobalLimitsAction(
  _: AiLimitsState,
  form: FormData,
): Promise<AiLimitsState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const before = await clientAiLimits();
  const next = {} as Record<ClientAiTool, ClientAiLimit>;
  for (const tool of CLIENT_AI_TOOLS) {
    const title = CLIENT_AI_TOOL_LABELS[tool].title;
    const shortMin = num(form, `${tool}.shortMin`, 1, AI_WINDOW_MIN_MAX);
    const short = num(form, `${tool}.short`, 1, AI_LIMIT_MAX);
    const longHours = num(form, `${tool}.longHours`, 1, AI_LONG_HOURS_MAX);
    const long = num(form, `${tool}.long`, 1, AI_LIMIT_MAX);
    if (shortMin === null || shortMin === "bad")
      return {
        error: `${title}: короткое окно — от 1 до ${AI_WINDOW_MIN_MAX} минут`,
      };
    if (longHours === null || longHours === "bad")
      return {
        error: `${title}: длинное окно — от 1 до ${AI_LONG_HOURS_MAX} часов`,
      };
    if (short === null || short === "bad" || long === null || long === "bad")
      return { error: `${title}: число запросов — от 1 до ${AI_LIMIT_MAX}` };
    if (longHours * 60 <= shortMin)
      return { error: `${title}: длинное окно должно быть длиннее короткого` };
    next[tool] = { short, shortMin, long, longHours };
  }
  await saveClientAiLimits(next, staff.user.id);
  await audit(staff, "aiLimits.global", "settings", "aiLimits", {
    before,
    after: next,
  });
  return {
    ok: "Сохранено — действует со следующего запроса. Если изменили длину окна, счёт в нём начался заново.",
  };
}

/** Свои лимиты клиента: пустое поле — общий лимит, 0 — помощник клиенту закрыт. */
export async function saveUserLimitsAction(
  _: AiLimitsState,
  form: FormData,
): Promise<AiLimitsState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const userId = String(form.get("userId") ?? "");
  if (!isUserId(userId)) return { error: BAD_FORM };
  const tools: UserAiOverride["tools"] = {};
  for (const tool of CLIENT_AI_TOOLS) {
    const short = num(form, `${tool}.short`, 0, AI_LIMIT_MAX);
    const long = num(form, `${tool}.long`, 0, AI_LIMIT_MAX);
    if (short === "bad" || long === "bad")
      return {
        error: `${CLIENT_AI_TOOL_LABELS[tool].title}: целое число от 0 до ${AI_LIMIT_MAX} или пусто`,
      };
    if (short !== null || long !== null)
      tools[tool] = {
        ...(short !== null ? { short } : {}),
        ...(long !== null ? { long } : {}),
      };
  }
  const note = String(form.get("note") ?? "")
    .trim()
    .slice(0, 200);
  const before = (await userAiOverrides())[userId]?.tools ?? null;
  await saveUserAiOverride(userId, tools, note, staff.user.id);
  await audit(staff, "aiLimits.user", "user", userId, {
    before,
    after: Object.keys(tools).length ? tools : null,
    note: note || undefined,
  });
  return {
    ok: Object.keys(tools).length
      ? "Сохранено — свои лимиты действуют со следующего запроса."
      : "Своих лимитов нет — у клиента общие.",
  };
}

/** Убрать свои лимиты клиента — снова общие. */
export async function clearUserLimitsAction(
  _: AiLimitsState,
  form: FormData,
): Promise<AiLimitsState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const userId = String(form.get("userId") ?? "");
  if (!isUserId(userId)) return { error: BAD_FORM };
  const before = (await userAiOverrides())[userId]?.tools ?? null;
  await saveUserAiOverride(userId, {}, "", staff.user.id);
  await audit(staff, "aiLimits.user", "user", userId, { before, after: null });
  return { ok: "Убрано — у клиента общие лимиты." };
}

/** Обнулить потраченное клиентом в текущих окнах — по одному помощнику или по всем. */
export async function resetUsageAction(
  _: AiLimitsState,
  form: FormData,
): Promise<AiLimitsState> {
  const staff = await assertStaff("settings.manage");
  if (!textForm(form).success) return { error: BAD_FORM };
  const userId = String(form.get("userId") ?? "");
  const raw = String(form.get("tool") ?? "");
  if (!isUserId(userId)) return { error: BAD_FORM };
  const tool = (CLIENT_AI_TOOLS as readonly string[]).includes(raw)
    ? (raw as ClientAiTool)
    : undefined;
  if (raw && !tool) return { error: BAD_FORM };
  await resetClientAiUsage(userId, tool);
  await audit(staff, "aiLimits.reset", "user", userId, { tool: tool ?? "all" });
  return { ok: "Счётчики обнулены." };
}
