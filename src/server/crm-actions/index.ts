import "server-only";
import { HttpError } from "@/server/api";

/**
 * Server actions CRM (ADR 0012, A5 — Раздел 5): тот же код, что раньше стоял в src/app/admin/**, — файлы "use server" со
 * своими проверками прав, zod и лимитами. Сайт зовёт их обёртками crmAction (src/server/v1-local-bridge-crm.ts): с БД —
 * здесь же, без БД — через API v1 (`webCrmAct`, имя `<модуль>.<действие>`). Модуль грузится по требованию.
 */
export const actionModules = {
  admin: () => import("./admin"),
  ai: () => import("./ai"),
  aiDesigner: () => import("./ai-designer"),
  aiLimits: () => import("./ai-limits"),
  automations: () => import("./automations"),
  catalog: () => import("./catalog"),
  chats: () => import("./chats"),
  clients: () => import("./clients"),
  clientsNew: () => import("./clients-new"),
  crm: () => import("./crm"),
  deals: () => import("./deals"),
  dealsFields: () => import("./deals-fields"),
  expenses: () => import("./expenses"),
  finance: () => import("./finance"),
  gifts: () => import("./gifts"),
  invoices: () => import("./invoices"),
  marketing: () => import("./marketing"),
  notify: () => import("./notify"),
  pricing: () => import("./pricing"),
  profit: () => import("./profit"),
  reviews: () => import("./reviews"),
  sales: () => import("./sales"),
  security: () => import("./security"),
  settings: () => import("./settings"),
  settingsAi: () => import("./settings-ai"),
  settingsCrm: () => import("./settings-crm"),
  settingsGoogle: () => import("./settings-google"),
  settingsKaspi: () => import("./settings-kaspi"),
  settingsMail: () => import("./settings-mail"),
  settingsTelephony: () => import("./settings-telephony"),
  settingsTransfer: () => import("./settings-transfer"),
  settingsWazzup: () => import("./settings-wazzup"),
  settingsWhatsapp: () => import("./settings-whatsapp"),
  shell: () => import("./shell"),
  site: () => import("./site"),
  support: () => import("./support"),
  team: () => import("./team"),
  templates: () => import("./templates"),
} as const;

/** Вызвать действие по имени `<модуль>.<действие>` с аргументами server action. */
export async function runCrmAction(name: string, args: unknown): Promise<unknown> {
  const dot = name.indexOf(".");
  const mod = name.slice(0, dot) as keyof typeof actionModules;
  const fn = name.slice(dot + 1);
  if (dot <= 0 || !Object.hasOwn(actionModules, mod) || !Array.isArray(args)) throw new HttpError(404, "notFound");
  const exports = (await actionModules[mod]()) as unknown as Record<string, unknown>;
  const action = Object.hasOwn(exports, fn) ? exports[fn] : undefined;
  if (typeof action !== "function") throw new HttpError(404, "notFound");
  return (action as (...a: unknown[]) => Promise<unknown>)(...args);
}
