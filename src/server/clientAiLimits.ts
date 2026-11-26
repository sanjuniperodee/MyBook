import "server-only";
import {
  getSetting,
  getSettings,
  saveSettings,
  type SettingKey,
} from "@/modules/workspace";
import { rateLimit } from "@/server/rateLimit";

/**
 * Лимиты AI у клиента: помощник при письме, AI-корректор и помощник в кабинете книги. У каждого два окна — короткое
 * (по умолчанию 10 минут, владелец может сделать час) и длинное (по умолчанию сутки) — и сколько запросов в каждом.
 * Общие значения — страница «Лимиты AI»; там же клиенту можно выдать свои лимиты (больше, меньше или 0 — закрыть).
 */

import { CLIENT_AI_TOOLS } from "@/shared/domain/aiTools";

export { CLIENT_AI_TOOLS };
export type ClientAiTool = (typeof CLIENT_AI_TOOLS)[number];

/** Границы значений в формах. */
export const AI_LIMIT_MAX = 10_000;
export const AI_WINDOW_MIN_MAX = 1_440;
export const AI_LONG_HOURS_MAX = 720;

export interface ClientAiLimit {
  /** Запросов за короткое окно. */
  short: number;
  /** Длина короткого окна, минут. */
  shortMin: number;
  /** Запросов за длинное окно. */
  long: number;
  /** Длина длинного окна, часов. */
  longHours: number;
}

/** Свой лимит клиента по помощнику: пусто — общий. */
export interface UserAiToolOverride {
  short?: number;
  long?: number;
}

export interface UserAiOverride {
  tools: Partial<Record<ClientAiTool, UserAiToolOverride>>;
  note?: string;
  /** Когда и кто менял (ISO, id сотрудника). */
  at: string;
  by: string;
}

const DEFAULTS: Record<ClientAiTool, ClientAiLimit> = {
  writer: { short: 10, shortMin: 10, long: 60, longHours: 24 },
  proofread: { short: 10, shortMin: 10, long: 80, longHours: 24 },
  help: { short: 20, shortMin: 10, long: 60, longHours: 24 },
};

/** Префиксы счётчиков (короткое и длинное окно) — так они назывались и раньше. */
const COUNTERS: Record<ClientAiTool, [string, string]> = {
  writer: ["write-ai", "write-ai-day"],
  proofread: ["proofread", "proofread-day"],
  help: ["help10", "help-day"],
};

const keysOf = (tool: ClientAiTool) =>
  [
    `${tool}.perTenMin`,
    `${tool}.windowMin`,
    `${tool}.perDay`,
    `${tool}.dayHours`,
  ] as [SettingKey, SettingKey, SettingKey, SettingKey];

const int = (raw: unknown, min: number, max: number): number | null => {
  const s =
    typeof raw === "number"
      ? String(raw)
      : typeof raw === "string"
        ? raw.trim()
        : "";
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
};

/** Общие лимиты по всем помощникам. */
export async function clientAiLimits(): Promise<
  Record<ClientAiTool, ClientAiLimit>
> {
  const all = CLIENT_AI_TOOLS.flatMap(keysOf);
  const v = await getSettings(all);
  const out = {} as Record<ClientAiTool, ClientAiLimit>;
  for (const tool of CLIENT_AI_TOOLS) {
    const [s, sm, l, lh] = keysOf(tool);
    const d = DEFAULTS[tool];
    out[tool] = {
      short: int(v[s], 1, AI_LIMIT_MAX) ?? d.short,
      shortMin: int(v[sm], 1, AI_WINDOW_MIN_MAX) ?? d.shortMin,
      long: int(v[l], 1, AI_LIMIT_MAX) ?? d.long,
      longHours: int(v[lh], 1, AI_LONG_HOURS_MAX) ?? d.longHours,
    };
  }
  return out;
}

export async function saveClientAiLimits(
  limits: Record<ClientAiTool, ClientAiLimit>,
  actorId: string,
) {
  const values: Partial<Record<SettingKey, string>> = {};
  for (const tool of CLIENT_AI_TOOLS) {
    const [s, sm, l, lh] = keysOf(tool);
    const x = limits[tool];
    Object.assign(values, {
      [s]: String(x.short),
      [sm]: String(x.shortMin),
      [l]: String(x.long),
      [lh]: String(x.longHours),
    });
  }
  await saveSettings(values, actorId);
}

/** Свои лимиты клиентов. Битая запись пропускается — у клиента остаются общие. */
export async function userAiOverrides(): Promise<
  Record<string, UserAiOverride>
> {
  let raw: unknown;
  try {
    raw = JSON.parse((await getSetting("ai.userLimits")) || "{}");
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, UserAiOverride> = {};
  for (const [userId, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-9a-f-]{36}$/i.test(userId) || !v || typeof v !== "object")
      continue;
    const rec = v as Record<string, unknown>;
    const saved = (
      rec.tools && typeof rec.tools === "object" ? rec.tools : {}
    ) as Record<string, unknown>;
    const tools: UserAiOverride["tools"] = {};
    for (const tool of CLIENT_AI_TOOLS) {
      const t = saved[tool] as Record<string, unknown> | undefined;
      if (!t || typeof t !== "object") continue;
      const short = int(t.short, 0, AI_LIMIT_MAX);
      const long = int(t.long, 0, AI_LIMIT_MAX);
      if (short !== null || long !== null)
        tools[tool] = {
          ...(short !== null ? { short } : {}),
          ...(long !== null ? { long } : {}),
        };
    }
    if (!Object.keys(tools).length) continue;
    out[userId] = {
      tools,
      note: typeof rec.note === "string" ? rec.note : undefined,
      at: String(rec.at ?? ""),
      by: String(rec.by ?? ""),
    };
  }
  return out;
}

/** Записать свои лимиты клиента; без единого своего значения запись удаляется — клиенту снова общие. */
export async function saveUserAiOverride(
  userId: string,
  tools: UserAiOverride["tools"],
  note: string,
  actorId: string,
) {
  const all = await userAiOverrides();
  const clean: UserAiOverride["tools"] = {};
  for (const tool of CLIENT_AI_TOOLS) {
    const t = tools[tool];
    if (t && (t.short !== undefined || t.long !== undefined)) clean[tool] = t;
  }
  if (Object.keys(clean).length)
    all[userId] = {
      tools: clean,
      ...(note ? { note } : {}),
      at: new Date().toISOString(),
      by: actorId,
    };
  else delete all[userId];
  await saveSettings({ "ai.userLimits": JSON.stringify(all) }, actorId);
}

export interface EffectiveAiLimit extends ClientAiLimit {
  /** Какие числа свои у клиента, а не общие. */
  customShort: boolean;
  customLong: boolean;
}

function effective(
  base: ClientAiLimit,
  own?: UserAiToolOverride,
): EffectiveAiLimit {
  return {
    ...base,
    short: own?.short ?? base.short,
    long: own?.long ?? base.long,
    customShort: own?.short !== undefined,
    customLong: own?.long !== undefined,
  };
}

/** Лимиты, которые действуют у клиента сейчас: свои, где заданы, иначе общие. */
export async function clientAiLimitsFor(
  userId: string,
): Promise<Record<ClientAiTool, EffectiveAiLimit>> {
  const [base, own] = await Promise.all([clientAiLimits(), userAiOverrides()]);
  const out = {} as Record<ClientAiTool, EffectiveAiLimit>;
  for (const tool of CLIENT_AI_TOOLS)
    out[tool] = effective(base[tool], own[userId]?.tools[tool]);
  return out;
}

/** Окно входит в имя счётчика: после смены длины окна счёт начинается заново, а не живёт по старому сроку. */
function counterKeys(
  tool: ClientAiTool,
  userId: string,
  l: ClientAiLimit,
): [string, string] {
  const [s, d] = COUNTERS[tool];
  return [`${s}:${l.shortMin}m:${userId}`, `${d}:${l.longHours}h:${userId}`];
}

/**
 * Засчитать запрос клиента. "short" — исчерпано короткое окно, "long" — длинное (тогда запрос не идёт к модели).
 * Лимит 0 — помощник клиенту закрыт.
 */
export async function hitClientAi(
  tool: ClientAiTool,
  userId: string,
): Promise<"ok" | "short" | "long"> {
  const l = (await clientAiLimitsFor(userId))[tool];
  // 0 — закрыт: не доверяем лимитеру (в памяти первое попадание окна проходит при любом лимите).
  if (l.short === 0) return "short";
  if (l.long === 0) return "long";
  const [shortKey, longKey] = counterKeys(tool, userId, l);
  if (!(await rateLimit(shortKey, l.short, l.shortMin * 60_000)))
    return "short";
  if (!(await rateLimit(longKey, l.long, l.longHours * 3_600_000)))
    return "long";
  return "ok";
}

export interface AiWindowUsage {
  used: number;
  /** Когда окно обнулится сам (мс эпохи); null — запросов в окне не было. */
  resetAt: number | null;
}

/** Сколько клиент потратил в текущих окнах по каждому помощнику. */
export async function clientAiUsage(
  userId: string,
): Promise<
  Record<
    ClientAiTool,
    { limit: EffectiveAiLimit; short: AiWindowUsage; long: AiWindowUsage }
  >
> {
  const { container } = await import("@/server/container");
  const limiter = container().rateLimiter;
  const limits = await clientAiLimitsFor(userId);
  const out = {} as Awaited<ReturnType<typeof clientAiUsage>>;
  await Promise.all(
    CLIENT_AI_TOOLS.map(async (tool) => {
      const l = limits[tool];
      const [sk, lk] = counterKeys(tool, userId, l);
      const [s, d] = await Promise.all([limiter.peek(sk), limiter.peek(lk)]);
      // Отклонённые попытки тоже попадают в счётчик — показываем не больше лимита.
      out[tool] = {
        limit: l,
        short: {
          used: s ? Math.min(s.count, l.short) : 0,
          resetAt: s?.resetAt ?? null,
        },
        long: {
          used: d ? Math.min(d.count, l.long) : 0,
          resetAt: d?.resetAt ?? null,
        },
      };
    }),
  );
  return out;
}

/** Обнулить потраченное клиентом: по одному помощнику или по всем. */
export async function resetClientAiUsage(userId: string, tool?: ClientAiTool) {
  const { container } = await import("@/server/container");
  const limiter = container().rateLimiter;
  const limits = await clientAiLimitsFor(userId);
  await Promise.all(
    (tool ? [tool] : [...CLIENT_AI_TOOLS]).flatMap((t) =>
      counterKeys(t, userId, limits[t]).map((k) => limiter.reset(k)),
    ),
  );
}
