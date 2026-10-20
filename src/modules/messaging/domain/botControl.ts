/**
 * Управление AI на уровне чата — независимо для каждого диалога, хранится в crm_conversations.bot_control:
 *
 * - нет записи — AI по общим правилам («Интеграции» → Бот: режим, рабочее время, подхват);
 * - active — менеджер вручную возобновил AI: бот отвечает в этом чате и днём, не дожидаясь менеджера;
 * - human — менеджер вручную написал клиенту: в рабочее время бот здесь не отвечает, пока менеджер не нажмёт «Возобновить
 *   AI» (не возвращается сам ни со временем, ни с новым рабочим днём). Настройка «Держать чат за менеджером днём»
 *   (humanHold, по умолчанию да); выключена — как раньше: менеджер молчит N минут — бот подхватывает. Вне рабочего времени — по настройке «Ночью
 *   отвечать и в чатах, которые ведёт менеджер» (по умолчанию да: клиент ночью не остаётся без ответа, и ночной режим не
 *   требует ручного включения в каждом чате);
 * - paused — пауза до времени (или до ручного возобновления): потом снова по общим правилам;
 * - disabled — AI отключён вручную («Отключить AI»): не отвечает ни днём, ни ночью, пока его не возобновят.
 *
 * Ручное отключение (disabled) и автоматическая пауза после ответа менеджера (human) — разные режимы: ответ менеджера
 * ручное отключение не перезаписывает. Чистые функции.
 */

export const BOT_CONTROL_MODES = ["active", "human", "paused", "disabled"] as const;
export type BotControlMode = (typeof BOT_CONTROL_MODES)[number];

export interface BotControl {
  mode: BotControlMode;
  /** До какого момента пауза (ISO); только для paused. */
  until: string | null;
  /** Кто перевёл (id сотрудника); null — CRM сама (ответ с телефона магазина). */
  by: string | null;
  /** Когда (ISO). */
  at: string;
  /** Откуда: crm / phone (ответ менеджера), button, resume, pause. */
  reason: string;
}

/** Режим AI в чате для интерфейса и метрик (названия — как в постановке задачи). */
export type ChatAiMode = "AI_ACTIVE" | "WAITING_TO_REPLY" | "HUMAN_TAKEOVER" | "AI_PAUSED" | "DISABLED";

const isMode = (v: unknown): v is BotControlMode => typeof v === "string" && (BOT_CONTROL_MODES as readonly string[]).includes(v);

/** Запись из базы (jsonb); не тот формат — как будто записи нет. */
export function readBotControl(raw: unknown): BotControl | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isMode(r.mode)) return null;
  const until = typeof r.until === "string" && !Number.isNaN(Date.parse(r.until)) ? r.until : null;
  if (r.mode === "paused" && !until) return null;
  return { mode: r.mode, until: r.mode === "paused" ? until : null, by: typeof r.by === "string" ? r.by : null, at: typeof r.at === "string" ? r.at : new Date(0).toISOString(), reason: typeof r.reason === "string" ? r.reason : "" };
}

/** Режим на момент now: истёкшая пауза — как будто записи нет (общие правила). */
export function controlAt(c: BotControl | null, now: Date): BotControl | null {
  if (c?.mode === "paused" && c.until && Date.parse(c.until) <= now.getTime()) return null;
  return c;
}

/** Пауза ещё идёт. */
export const pausedNow = (c: BotControl | null, now: Date) => c?.mode === "paused" && !!c.until && Date.parse(c.until) > now.getTime();

/**
 * Может ли бот сейчас отвечать в этом чате автоматически. workTime — рабочее время магазина (по его поясу, не по браузеру
 * менеджера); humanNight — ночью отвечать и в чатах, которые днём вёл менеджер.
 */
export function autoReplyAllowed(c: BotControl | null, now: Date, opts: { workTime: boolean; humanNight: boolean; humanHold?: boolean }): boolean {
  const cur = controlAt(c, now);
  if (!cur || cur.mode === "active") return true;
  if (cur.mode === "human") return opts.workTime ? opts.humanHold === false : opts.humanNight;
  return false;
}

/**
 * Менеджер вручную написал клиенту: чат переходит к нему (human). Ручное отключение остаётся ручным — его не заменяет
 * автоматическая пауза; уже human — без изменений (null: писать нечего, время перехвата — первое).
 */
export function afterManagerReply(prev: BotControl | null, now: Date, by: string | null, reason: string): BotControl | null {
  if (prev?.mode === "disabled" || prev?.mode === "human") return null;
  return { mode: "human", until: null, by, at: now.toISOString(), reason };
}

/** Подпись режима для полосы бота в чате. */
export function controlLabel(c: BotControl, opts: { workTime: boolean; humanNight: boolean; humanHold?: boolean; untilLabel?: string }): string {
  if (c.mode === "disabled") return "AI отключён вручную — бот в этом чате не отвечает";
  if (c.mode === "paused") return `AI на паузе${opts.untilLabel ? ` до ${opts.untilLabel}` : ""}`;
  if (c.mode === "human" && opts.humanHold === false) return "Менеджер ведёт диалог — замолчит, бот подхватит";
  if (c.mode === "human") return opts.humanNight ? (opts.workTime ? "Менеджер ведёт диалог — AI не отвечает (ночью ответит)" : "Менеджер ведёт диалог — сейчас нерабочее время, AI отвечает") : "Менеджер ведёт диалог — AI не отвечает";
  return "AI включён";
}
