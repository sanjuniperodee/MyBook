import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { executor, inTransaction, type Executor } from "@/shared/infrastructure/database";
import { crmSettings } from "@/shared/infrastructure/db/schema";
import { decryptSecret, encryptSecret, randomToken } from "@/shared/crypto";
import type { SettingsStore } from "@/shared/application";

interface Def {
  /** Хранится зашифрованным и никогда не отдаётся в браузер целиком. */
  secret?: boolean;
  /** Переменная окружения, которая переопределяет значение из админки. */
  env?: string;
  /** Переменная окружения со значением по умолчанию: админка может его изменить (адреса сервисов в docker compose). */
  envDefault?: string;
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
  /** Веб-телефон Zadarma в браузере: номер АТС (SIP-логин сотрудника = <номер АТС>-<внутренний номер>). */
  "zadarma.pbxId": { env: "ZADARMA_PBX_ID" },
  "zadarma.webphone": { default: "off" },
  /** Через сколько минут без ответа клиенту чат считается просроченным. */
  "crm.slaMinutes": { default: "15" },
  /** Рабочее время: JSON { days: [1..7], from: "09:00", to: "21:00" }. */
  "crm.workHours": { default: '{"days":[1,2,3,4,5,6,7],"from":"09:00","to":"21:00"}' },
  /** С какого действия клиента на сайте заводить сделку: off | registered | book_started | book_half | book_ready. */
  "crm.autoDealFrom": { default: "book_started" },
  /** Реквизиты перевода Kaspi для клиентов (заказ, сертификат, счёт из чата): номер получателя и имя. Пусто — перевод не показываем. */
  "pay.transferPhone": { env: "TRANSFER_PHONE" },
  "pay.transferName": { env: "TRANSFER_NAME" },
  /** Через сколько минут не взятая заявка переходит следующему менеджеру по кругу; 0 — не передавать. */
  "crm.reassignMinutes": { default: "15" },
  /** В успешную сделку заказа можно влить заявку того же контакта, пришедшую не дальше N дней от её закрытия; 0 — нельзя (sales mergeRefusal). */
  "crm.mergeClosedDays": { default: "14" },
  /** Заявки с новых номеров сначала попадают в «Неразобранное»: on | off. */
  "crm.unsorted": { default: "on" },
  /** Максимальная персональная скидка, которую менеджер может дать из чата, %. */
  "crm.maxDiscount": { default: "15" },
  /** Номер WhatsApp магазина: рекламные ссылки «написать в WhatsApp» и контакты сайта (футер, сертификат, оплата); пусто — заглушка из config/site.ts. */
  "crm.whatsappNumber": {},
  /** Бот-автоответчик: off | fallback (если менеджер не ответил за N минут) | off_hours | always — по умолчанию (docs/features/bot-autoresponder.md). */
  "bot.mode": { default: "always" },
  /**
   * Менеджер написал клиенту — чат за ним: днём AI здесь не отвечает, пока его не возобновят вручную (on); off — как
   * раньше: менеджер замолчал на N минут — бот подхватывает. humanNight — ночью AI отвечает и в таких чатах.
   */
  "bot.humanHold": { env: "BOT_HUMAN_HOLD", default: "on" },
  "bot.humanNight": { env: "BOT_HUMAN_NIGHT", default: "on" },
  /** Настройки бота: JSON BotConfig (каналы, вопросы и тексты ru/kk, частые вопросы, акция); старый { greeting, questions: [{ text, field }], finish } тоже читается. */
  "bot.config": {},
  /** Уроки AI-продажника (работа над ошибками): JSON [{ id, text, why, at, source }] — пишет ночной разбор и владелец. */
  "bot.lessons": {},
  /** Подборка материалов AI-продажника (фото, видео, пример книги): JSON BotMaterial[]; файлы — в хранилище bot-media/. */
  "bot.materials": {},
  /** У кого сейчас телефон WhatsApp магазина ({ id, name }): ответ с телефона забирает новую заявку на него. */
  "whatsapp.phoneHolder": {},
  /** Когда правила автоматизаций пишут клиентам первыми: JSON { from, to } по Алматы (automation-15). Автоответ — в любое время. */
  "whatsapp.rulesWindow": { default: '{"from":"09:00","to":"21:00"}' },
  /** Сколько сообщений клиентам от правил уходит за сутки; 0 — правила первыми не пишут. */
  "whatsapp.rulesDailyLimit": { default: "40" },
  /**
   * Праздники для повторных продаж (правило «Приближается праздник»): JSON [{ id, date: "ММ-ДД", ru, kk }]. Пусто —
   * праздники РК по умолчанию (DEFAULT_HOLIDAYS в automation), «[]» — праздников нет.
   */
  "automation.holidays": {},
  /** Журнал ночных разборов бесед AI-продажника (последние 14). */
  "bot.coach": {},
  /** Ключи Web Push (создаются автоматически). */
  "push.vapidPublic": {},
  "push.vapidPrivate": { secret: true },
  /** AI-помощник: выбранный провайдер (anthropic | openai | deepseek | openrouter | custom), включён ли, база знаний для ответов. */
  "ai.provider": { env: "CRM_AI_PROVIDER", default: "anthropic" },
  "ai.enabled": { default: "on" },
  "ai.knowledge": {},
  /** Claude (Anthropic API): ключ, адрес API (для прокси), модель (пусто — по умолчанию). */
  "ai.apiKey": { secret: true, env: "ANTHROPIC_API_KEY" },
  "ai.baseUrl": { env: "CRM_AI_BASE_URL", default: "https://api.anthropic.com" },
  "ai.anthropic.model": {},
  /** ChatGPT (OpenAI API). */
  "ai.openai.apiKey": { secret: true, env: "OPENAI_API_KEY" },
  "ai.openai.baseUrl": { env: "OPENAI_BASE_URL" },
  "ai.openai.model": {},
  /** DeepSeek (OpenAI-совместимый API). */
  "ai.deepseek.apiKey": { secret: true, env: "DEEPSEEK_API_KEY" },
  "ai.deepseek.baseUrl": {},
  "ai.deepseek.model": {},
  /** OpenRouter: сотни моделей по одному ключу, в том числе бесплатные (…:free, openrouter/free). */
  "ai.openrouter.apiKey": { secret: true, env: "OPENROUTER_API_KEY" },
  "ai.openrouter.baseUrl": {},
  "ai.openrouter.model": {},
  /** Groq: бесплатный Whisper для расшифровки голосовых (и быстрые открытые модели). */
  "ai.groq.apiKey": { secret: true, env: "GROQ_API_KEY" },
  "ai.groq.baseUrl": {},
  "ai.groq.model": {},
  /**
   * Проверка текста в редакторе книги (AI-корректор): свой провайдер (пусто — как у AI-помощника) и своя модель
   * (пусто — модель провайдера), чтобы, например, корректор работал на бесплатной модели OpenRouter, а помощник — на Claude.
   */
  "proofread.enabled": { default: "on" },
  "proofread.provider": {},
  "proofread.model": {},
  /** Модель AI-продажника бота (режим «Продаёт», движок AI): свой провайдер и модель или (пусто) — как у AI-помощника. */
  "seller.provider": {},
  "seller.model": {},
  /**
   * Маршрутизация продажника (docs/features/bot-llm-routing.md): Claude — основная модель по уровням, остальные провайдеры —
   * запасные. on — Haiku / Sonnet / Opus по сложности хода; shadow — всегда уровень по умолчанию, выбор только в след и
   * метрики; off — как раньше: одна модель seller.provider / seller.model без запасных.
   */
  "seller.route": { env: "AI_SELLER_ROUTING", default: "on" },
  /** Модели уровней Claude (пусто — claude-haiku-5-5 / claude-sonnet-5-5 / claude-opus-5-5). */
  "seller.route.haiku": { env: "AI_MODEL_HAIKU" },
  "seller.route.sonnet": { env: "AI_MODEL_SONNET" },
  "seller.route.opus": { env: "AI_MODEL_OPUS" },
  /** Уровень по умолчанию: haiku | sonnet | opus. */
  "seller.route.default": { env: "AI_ROUTE_DEFAULT_TIER", default: "haiku" },
  /** Sonnet и Opus можно выключить ради экономии токенов: ход тогда идёт на ближайший включённый уровень ниже (on | off). */
  "seller.route.sonnetEnabled": { env: "AI_ROUTE_SONNET_ENABLED", default: "on" },
  "seller.route.opusEnabled": { env: "AI_ROUTE_OPUS_ENABLED", default: "on" },
  /** Пороги очков сложности хода для Sonnet и Opus. */
  "seller.route.sonnetAt": { env: "AI_ROUTE_SONNET_AT", default: "2" },
  "seller.route.opusAt": { env: "AI_ROUTE_OPUS_AT", default: "6" },
  /** Сколько дополнительных запросов-эскалаций можно за один ход клиента (0–4). */
  "seller.route.maxExtra": { env: "AI_ROUTE_MAX_EXTRA", default: "2" },
  /** Потолок расходов на беседу (пусто — $0.50) и на сутки (пусто — без потолка), $; 0 — без потолка. На потолке — только Haiku. */
  "seller.route.budget": { env: "AI_ROUTE_BUDGET_USD" },
  "seller.route.dailyBudget": { env: "AI_ROUTE_DAILY_BUDGET_USD" },
  /** Прайс, $ за 1M токенов: JSON { "модель": { input, output, cacheRead, cacheWrite } } поверх цен по умолчанию. */
  "seller.route.prices": { env: "AI_ROUTE_PRICES" },
  /** Запасные провайдеры продажника по порядку: «openai,deepseek»; пусто — прежний провайдер продажника, если не Claude. */
  "seller.fallbacks": { env: "AI_SELLER_FALLBACKS" },
  /** Распознавание голосовых и фото клиента для AI-продажника: свой провайдер и модель или (пусто) — как у продажника. */
  "media.provider": {},
  "media.model": {},
  /** Любой OpenAI-совместимый сервер: Qwen, локальная модель и т. п. */
  "ai.custom.apiKey": { secret: true },
  "ai.custom.baseUrl": {},
  "ai.custom.model": {},
  /**
   * Исходящая почта (SMTP): письма клиентам о заказах, сброс пароля, письма менеджеров из CRM.
   * Переменные SMTP_* сервера действуют группой: если задан SMTP_HOST, настройки берутся только из них.
   */
  "mail.smtpHost": {},
  "mail.smtpPort": { default: "587" },
  /** true — TLS сразу (порт 465), false — STARTTLS, пусто — по порту. */
  "mail.smtpSecure": {},
  "mail.smtpUser": {},
  "mail.smtpPassword": { secret: true },
  /** Отправитель: «MyBooks <hello@mybook.kz>». */
  "mail.from": {},
  /** Куда отвечать на письма менеджеров (если не на адрес отправителя). */
  "mail.replyTo": {},
  /** Почта как канал: входящие по IMAP (ящик, куда клиенты пишут) и/или вебхуком почтового сервиса. */
  "email.imapHost": { env: "CRM_IMAP_HOST" },
  "email.imapPort": { env: "CRM_IMAP_PORT", default: "993" },
  "email.imapUser": { env: "CRM_IMAP_USER" },
  "email.imapPassword": { secret: true, env: "CRM_IMAP_PASSWORD" },
  "email.imapMailbox": { default: "INBOX" },
  /** UID последнего обработанного письма — чтобы не забирать старые письма повторно. */
  "email.imapLastUid": {},
  "email.webhookToken": { secret: true },
  /** Виджет на сайте: кнопки WhatsApp и «Перезвоните мне», онлайн-чат. */
  "widget.enabled": { default: "on" },
  "widget.chat": { default: "on" },
  /** Безопасность CRM: обязательная 2FA для сотрудников и список разрешённых IP (по строке на адрес/подсеть). */
  "security.require2fa": { default: "off" },
  "security.ipAllowlist": {},
  /** Цены и видимость тарифов из админки («Цены и тарифы»): JSON CatalogOverrides (config/site.ts) поверх заводских значений. */
  "catalog.overrides": {},
  /** Регистрация новых клиентов на сайте: on | off (выключена — страница регистрации закрыта, ссылки скрыты). */
  "site.registration": { default: "on" },
  /** Реквизиты продавца для оферты, футера и упаковочного листа (админка → «Сайт»); пусто — заглушка из config/site.ts. */
  "site.legalName": {},
  "site.bin": {},
  "site.phone": {},
  /**
   * Оплата через Kaspi Pay (kaspi-pos-automation): адрес сервиса, включена ли оплата, сессия кассира (JSON после входа
   * по SMS-коду) и секрет подписи вебхуков — необязательный: без подписи уведомление лишь повод сверить счёт с Kaspi.
   */
  "kaspi.apiUrl": { envDefault: "KASPI_API_URL", default: "http://127.0.0.1:3010" },
  "kaspi.enabled": { default: "off" },
  "kaspi.session": { secret: true },
  "kaspi.webhookSecret": { secret: true, env: "KASPI_WEBHOOK_SECRET" },
  /** Сигнал «кассир Kaspi отключён»: через сколько минут подряд без кассира сообщать руководителям (0 — сразу). */
  "kaspi.alertAfterMinutes": { default: "5" },
  /** Что показала последняя проверка кассира (JSON KaspiWatchState): пишет проход планировщика при смене состояния. */
  "kaspi.watch": {},
  /**
   * WhatsApp: через Wazzup (по умолчанию) или свой шлюз GOWA (go-whatsapp-web-multidevice, номер привязывается по QR).
   * Для GOWA — адрес шлюза и логин:пароль его API (APP_BASIC_AUTH); вебхук устройства магазина сайт настраивает в шлюзе сам.
   */
  "whatsapp.provider": { envDefault: "WHATSAPP_PROVIDER", default: "wazzup" },
  "gowa.baseUrl": { envDefault: "GOWA_API_URL", default: "http://127.0.0.1:3020" },
  "gowa.basicAuth": { secret: true, envDefault: "GOWA_BASIC_AUTH" },
  /** Куда шлюз отправляет входящие (вебхук устройства магазина); пусто — адрес сайта + /api/integrations/gowa. */
  "gowa.callbackUrl": { envDefault: "GOWA_CALLBACK_URL" },
  /** Секрет подписи вебхука: сайт сам передаёт его шлюзу при подключении устройства. */
  "gowa.webhookSecret": { secret: true },
  /** Когда история чатов шлюза последний раз загружалась в CRM (ISO): следующий проход берёт только обновившиеся чаты. */
  "gowa.historySyncedAt": {},
} satisfies Record<string, Def>;

export type SettingKey = keyof typeof settingDefs;
const defs: Record<SettingKey, Def> = settingDefs;

/**
 * Кэш общий для процесса (globalThis): Next.js загружает модуль в разные слои бандла (страницы, server actions,
 * instrumentation), а контейнер — один на процесс. Иначе сохранение сбросило бы кэш только в своём слое.
 */
const store = globalThis as unknown as { __mybookSettings?: { at: number; values: Map<string, string> } | null };
const TTL_MS = 10_000;

async function load() {
  const cache = store.__mybookSettings;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const rows = await db.select().from(crmSettings);
  const values = new Map<string, string>();
  for (const r of rows) {
    const def = defs[r.key as SettingKey];
    if (!def) continue;
    const v = def.secret ? decryptSecret(r.value) : r.value;
    if (v !== null) values.set(r.key, v);
  }
  store.__mybookSettings = { at: Date.now(), values };
  return values;
}

function invalidateSettings() {
  store.__mybookSettings = null;
}

export async function getSetting(key: SettingKey): Promise<string> {
  const def = defs[key];
  const fromEnv = def.env ? process.env[def.env] : undefined;
  if (fromEnv) return fromEnv;
  return (await load()).get(key) ?? (def.envDefault ? process.env[def.envDefault] : undefined) ?? def.default ?? "";
}

export async function getSettings<K extends SettingKey>(keys: K[]): Promise<Record<K, string>> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = await getSetting(k);
  return out;
}

/** Задано ли значение переменной окружения (тогда поле в админке только для чтения). */
export const fromEnv = (key: SettingKey) => !!(defs[key].env && process.env[defs[key].env!]);

/**
 * Сохранить настройки: пустое значение — удалить ключ, остальные — upsert. Всё одной транзакцией и одним запросом
 * на вставку (B7): при ошибке не остаётся половины настроек. Внутри внешней транзакции — в ней же.
 */
export async function saveSettings(values: Partial<Record<SettingKey, string>>, actorId: string | null) {
  const entries = Object.entries(values) as [SettingKey, string][];
  const toDelete = entries.filter(([, v]) => v === "").map(([k]) => k);
  const rows = entries.filter(([, v]) => v !== "").map(([key, v]) => ({ key, value: defs[key].secret ? encryptSecret(v) : v, updatedById: actorId }));
  const write = async (tx: Executor) => {
    if (toDelete.length) await tx.delete(crmSettings).where(inArray(crmSettings.key, toDelete));
    if (rows.length)
      await tx
        .insert(crmSettings)
        .values(rows)
        .onConflictDoUpdate({ target: crmSettings.key, set: { value: sql`excluded.value`, updatedById: sql`excluded.updated_by_id`, updatedAt: new Date() } });
  };
  await inTransaction(() => write(executor()));
  invalidateSettings();
}

/** Токен вебхука: создаётся при первом обращении, чтобы адрес для провайдера был сразу готов. */
export async function ensureToken(key: "wazzup.webhookToken" | "pbx.token" | "email.webhookToken" | "kaspi.webhookSecret" | "gowa.webhookSecret"): Promise<string> {
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

/** Порт настроек для других модулей (src/shared/application): каждый объявляет только свои ключи. */
export const settingsStore: SettingsStore<SettingKey> = { get: getSetting, getMany: getSettings, save: saveSettings };

/** «••••1a2b» — для показа сохранённого секрета. */
export const maskSecret = (v: string) => (v ? `••••${v.slice(-4)}` : "");
