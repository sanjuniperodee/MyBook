import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { crmSettings } from "../db/schema";
import { decryptSecret, encryptSecret, randomToken } from "./crypto";

interface Def {
  /** Хранится зашифрованным и никогда не отдаётся в браузер целиком. */
  secret?: boolean;
  /** Переменная окружения, которая переопределяет значение из админки. */
  env?: string;
  default?: string;
}

export const settingDefs = {
  "wazzup.apiKey": { secret: true, env: "WAZZUP_API_KEY" },
  "wazzup.baseUrl": { env: "WAZZUP_API_URL", default: "https://api.wazzup24.com" },
  /** Токен в адресе вебхука: без него входящие запросы отклоняются. */
  "wazzup.webhookToken": { secret: true },
  /** Канал WhatsApp для первых сообщений клиентам (когда диалога ещё нет). */
  "wazzup.channelId": { env: "WAZZUP_CHANNEL_ID" },
  "telephony.provider": { env: "TELEPHONY_PROVIDER", default: "off" },
  "zadarma.key": { secret: true, env: "ZADARMA_KEY" },
  "zadarma.secret": { secret: true, env: "ZADARMA_SECRET" },
  "zadarma.baseUrl": { env: "ZADARMA_API_URL", default: "https://api.zadarma.com" },
  "pbx.token": { secret: true, env: "PBX_WEBHOOK_TOKEN" },
  /** Через сколько минут без ответа клиенту чат считается просроченным. */
  "crm.slaMinutes": { default: "15" },
  /** Рабочее время: JSON { days: [1..7], from: "09:00", to: "21:00" }. */
  "crm.workHours": { default: '{"days":[1,2,3,4,5,6,7],"from":"09:00","to":"21:00"}' },
  /** С какого действия клиента на сайте заводить сделку: off | registered | book_started | book_half | book_ready. */
  "crm.autoDealFrom": { default: "book_started" },
  /** Заявки с новых номеров сначала попадают в «Неразобранное»: on | off. */
  "crm.unsorted": { default: "on" },
  /** Максимальная персональная скидка, которую менеджер может дать из чата, %. */
  "crm.maxDiscount": { default: "15" },
} satisfies Record<string, Def>;

export type SettingKey = keyof typeof settingDefs;
const defs: Record<SettingKey, Def> = settingDefs;

let cache: { at: number; values: Map<string, string> } | null = null;
const TTL_MS = 10_000;

async function load() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const rows = await db.select().from(crmSettings);
  const values = new Map<string, string>();
  for (const r of rows) {
    const def = defs[r.key as SettingKey];
    if (!def) continue;
    const v = def.secret ? decryptSecret(r.value) : r.value;
    if (v !== null) values.set(r.key, v);
  }
  cache = { at: Date.now(), values };
  return values;
}

export function invalidateSettings() {
  cache = null;
}

export async function getSetting(key: SettingKey): Promise<string> {
  const def = defs[key];
  const fromEnv = def.env ? process.env[def.env] : undefined;
  if (fromEnv) return fromEnv;
  return (await load()).get(key) ?? def.default ?? "";
}

export async function getSettings<K extends SettingKey>(keys: K[]): Promise<Record<K, string>> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = await getSetting(k);
  return out;
}

/** Задано ли значение переменной окружения (тогда поле в админке только для чтения). */
export const fromEnv = (key: SettingKey) => !!(defs[key].env && process.env[defs[key].env!]);

export async function saveSettings(values: Partial<Record<SettingKey, string>>, actorId: string | null) {
  const entries = Object.entries(values) as [SettingKey, string][];
  const toDelete = entries.filter(([, v]) => v === "").map(([k]) => k);
  if (toDelete.length) await db.delete(crmSettings).where(inArray(crmSettings.key, toDelete));
  for (const [key, v] of entries) {
    if (v === "") continue;
    const value = defs[key].secret ? encryptSecret(v) : v;
    await db
      .insert(crmSettings)
      .values({ key, value, updatedById: actorId })
      .onConflictDoUpdate({ target: crmSettings.key, set: { value, updatedById: actorId, updatedAt: new Date() } });
  }
  invalidateSettings();
}

/** Токен вебхука: создаётся при первом обращении, чтобы адрес для провайдера был сразу готов. */
export async function ensureToken(key: "wazzup.webhookToken" | "pbx.token"): Promise<string> {
  const existing = await getSetting(key);
  if (existing) return existing;
  const token = randomToken();
  await saveSettings({ [key]: token }, null);
  return token;
}

export async function deleteSetting(key: SettingKey) {
  await db.delete(crmSettings).where(eq(crmSettings.key, key));
  invalidateSettings();
}

/** «••••1a2b» — для показа сохранённого секрета. */
export const maskSecret = (v: string) => (v ? `••••${v.slice(-4)}` : "");
