/**
 * Наблюдаемость фона (CRM → Настройки → «Фон и очереди»): какие потоки есть, какие задания в них, пороги «внимание» и
 * «сбой», подписи. Один источник для сервера (оценка, уведомления руководителю), страницы CRM и приложения: файл без
 * зависимостей, пороги и подписи нигде больше не повторяются.
 */

/** Состояние потока или задания: в норме, внимание, сбой, выключено (нечего проверять). */
export type OpsLevel = "ok" | "warn" | "down" | "off";

export const OPS_LEVELS: readonly OpsLevel[] = ["ok", "warn", "down", "off"];

export const OPS_LEVEL_LABEL: Record<OpsLevel, string> = { ok: "В норме", warn: "Внимание", down: "Сбой", off: "Выключено" };

/** Хуже из двух: сбой > внимание > в норме > выключено. */
const RANK: Record<OpsLevel, number> = { off: 0, ok: 1, warn: 2, down: 3 };
export const worseLevel = (a: OpsLevel, b: OpsLevel): OpsLevel => (RANK[b] > RANK[a] ? b : a);
export const worstLevel = (levels: Iterable<OpsLevel>, empty: OpsLevel = "ok"): OpsLevel => {
  let out: OpsLevel | null = null;
  for (const l of levels) out = out ? worseLevel(out, l) : l;
  return out ?? empty;
};

/** Потоки — карточки страницы, по порядку. */
export const OPS_STREAMS = ["worker", "outbox", "kaspi", "whatsapp", "ai", "media", "mail", "print"] as const;
export type OpsStream = (typeof OPS_STREAMS)[number];

export const OPS_STREAM_LABEL: Record<OpsStream, { title: string; hint: string }> = {
  worker: { title: "Планировщик", hint: "Процесс mybook-worker: минутный проход CRM, медленный проход раз в 15 минут и их шаги" },
  outbox: { title: "Очередь событий", hint: "Outbox: события заказов, оплат и сделок доставляются подписчикам с повторами" },
  kaspi: { title: "Kaspi", hint: "Сверка оплат Kaspi Pay, кассир, доступ по оплаченным счетам" },
  whatsapp: { title: "WhatsApp", hint: "Сверка со шлюзом GOWA, неотправленные сообщения, бот, история и звонки" },
  ai: { title: "ИИ в CRM", hint: "Расшифровка голосовых, этапы сделок, автозаполнение полей, разбор бота" },
  media: { title: "Видео и аудио", hint: "Очередь обработки своих видео и аудио клиентов (ffmpeg)" },
  mail: { title: "Письма", hint: "Автописьма клиентам, подарочные сертификаты, входящая почта IMAP" },
  print: { title: "Файлы для печати", hint: "Сборка PDF для типографии после оплаты заказа" },
};

/**
 * Задания с пульсом (таблица job_pulses): поток, подпись и как часто идут. every — секунды; null — по событию (сборка
 * после оплаты), у таких нет «давно не было прохода». Шаги проходов планировщика (имена — как в src/server/scheduler.ts)
 * идут вместе со своим проходом.
 */
export interface OpsJobDef {
  stream: OpsStream;
  label: string;
  every: number | null;
  /** Шаг прохода планировщика: «давно не было» у него — от прохода (одна тревога в «Планировщике», а не у каждого шага). */
  pass?: "scheduler.slow" | "scheduler.crm";
}

const SLOW = 15 * 60;
const CRM = 60;

export const OPS_JOBS = {
  // Проходы планировщика.
  "scheduler.slow": { stream: "worker", label: "Медленный проход (раз в 15 минут)", every: SLOW },
  "scheduler.crm": { stream: "worker", label: "Минутный проход CRM", every: CRM },
  outbox: { stream: "outbox", label: "Доставка событий (раз в 15 с)", every: 15 },
  "gowa.catchup": { stream: "whatsapp", label: "Сверка со шлюзом GOWA (раз в 30 с)", every: 30 },
  "kaspi.fast": { stream: "kaspi", label: "Сверка оплат за 20 минут (раз в 5 с)", every: 5 },
  "kaspi.slow": { stream: "kaspi", label: "Сверка оплат за трое суток (раз в 3 минуты)", every: 3 * 60 },
  "kaspi.deals": { stream: "kaspi", label: "Сверка счетов из чата (раз в 15 минут)", every: SLOW },
  "print.warmup": { stream: "print", label: "Сборка файлов после оплаты", every: null },
  // Шаги медленного прохода.
  gifts: { stream: "mail", label: "Отложенные сертификаты", every: SLOW, pass: "scheduler.slow" },
  "lifecycle emails": { stream: "mail", label: "Автописьма клиентам", every: SLOW, pass: "scheduler.slow" },
  "outbox purge": { stream: "outbox", label: "Чистка доставленных событий", every: SLOW, pass: "scheduler.slow" },
  "notifications purge": { stream: "worker", label: "Чистка старых уведомлений", every: SLOW, pass: "scheduler.slow" },
  "whatsapp history": { stream: "whatsapp", label: "История WhatsApp из шлюза", every: SLOW, pass: "scheduler.slow" },
  "chat avatars": { stream: "whatsapp", label: "Фото профиля клиентов", every: SLOW, pass: "scheduler.slow" },
  "bot coach": { stream: "ai", label: "Ночной разбор бесед бота", every: SLOW, pass: "scheduler.slow" },
  "ai autofill": { stream: "ai", label: "Автозаполнение полей сделки", every: SLOW, pass: "scheduler.slow" },
  "bot traces purge": { stream: "worker", label: "Чистка следов бота", every: SLOW, pass: "scheduler.slow" },
  "call recordings purge": { stream: "worker", label: "Чистка старых записей звонков", every: SLOW, pass: "scheduler.slow" },
  "preview cache sweep": { stream: "print", label: "Чистка кэша предпросмотров", every: SLOW, pass: "scheduler.slow" },
  "answer files sweep": { stream: "media", label: "Брошенные загрузки и очередь", every: SLOW, pass: "scheduler.slow" },
  "deleted accounts purge": { stream: "worker", label: "Дочистка удалённых аккаунтов", every: SLOW, pass: "scheduler.slow" },
  "whatsapp media dedup": { stream: "whatsapp", label: "Склейка одинаковых вложений", every: SLOW, pass: "scheduler.slow" },
  "kaspi pay forms": { stream: "kaspi", label: "Форма оплаты из истории кассы", every: SLOW, pass: "scheduler.slow" },
  // Шаги минутного прохода CRM.
  "crm automations": { stream: "worker", label: "Правила CRM", every: CRM, pass: "scheduler.crm" },
  "task reminders": { stream: "worker", label: "Напоминания о задачах", every: CRM, pass: "scheduler.crm" },
  "overdue tasks": { stream: "worker", label: "Просроченные задачи", every: CRM, pass: "scheduler.crm" },
  "board rules": { stream: "worker", label: "Правила досок", every: CRM, pass: "scheduler.crm" },
  "recurring cards": { stream: "worker", label: "Повторяющиеся карточки", every: CRM, pass: "scheduler.crm" },
  "google calendar": { stream: "worker", label: "Google Календарь", every: CRM, pass: "scheduler.crm" },
  "lead routing": { stream: "worker", label: "Круг заявок", every: CRM, pass: "scheduler.crm" },
  "stage order": { stream: "ai", label: "Порядок в воронке", every: CRM, pass: "scheduler.crm" },
  "ai transcribe": { stream: "ai", label: "Расшифровка голосовых", every: CRM, pass: "scheduler.crm" },
  "ai stages": { stream: "ai", label: "ИИ ведёт этапы", every: CRM, pass: "scheduler.crm" },
  bot: { stream: "whatsapp", label: "Бот-квалификатор", every: CRM, pass: "scheduler.crm" },
  "message retry": { stream: "whatsapp", label: "Повтор неотправленных", every: CRM, pass: "scheduler.crm" },
  "whatsapp calls": { stream: "whatsapp", label: "Звонки WhatsApp", every: CRM, pass: "scheduler.crm" },
  imap: { stream: "mail", label: "Входящая почта (IMAP)", every: CRM, pass: "scheduler.crm" },
  "invoice access": { stream: "kaspi", label: "Доступ по оплаченным счетам", every: CRM, pass: "scheduler.crm" },
  "invoice expiry": { stream: "kaspi", label: "Истечение счетов", every: CRM, pass: "scheduler.crm" },
  "kaspi watch": { stream: "kaspi", label: "Кассир Kaspi", every: CRM, pass: "scheduler.crm" },
  "morning digest": { stream: "worker", label: "Утренняя сводка", every: CRM, pass: "scheduler.crm" },
} as const satisfies Record<string, OpsJobDef>;

export type OpsJob = keyof typeof OPS_JOBS;
export const isOpsJob = (key: string): key is OpsJob => Object.hasOwn(OPS_JOBS, key);

/**
 * Пороги. Задание «давно не было прохода»: внимание — дольше max(2 интервала, интервал + минута), сбой — дольше
 * max(5 интервалов, интервал + 3 минуты); выкатка (перезапуск воркера на 1–2 минуты) сбоя не даёт. Ошибки подряд:
 * одна — внимание, три — сбой; ошибка за последний час при удачном последнем проходе — внимание.
 */
export const OPS_THRESHOLDS = {
  staleWarnFactor: 2,
  staleWarnSlackSec: 60,
  staleDownFactor: 5,
  staleDownSlackSec: 180,
  failsDown: 3,
  recentErrorSec: 3600,
  /** Событие outbox ждёт доставки (срок повтора наступил): внимание — минута, сбой — 5 минут. */
  outboxDueWarnSec: 60,
  outboxDueDownSec: 300,
  /** Событие ушло в «разбор» (попытки исчерпаны) за последний час — сбой, раньше — внимание. */
  outboxDeadDownSec: 3600,
  /** Сообщения WhatsApp со статусом «ошибка» за час: внимание — 1, сбой — 5. */
  messageErrorsWarn: 1,
  messageErrorsDown: 5,
  /** Наше сообщение висит «отправляется» дольше 10 минут — внимание, три и больше — сбой. */
  messagePendingSec: 600,
  messagePendingDown: 3,
  /** Голосовое ждёт расшифровки (при включённой расшифровке): внимание — 10 минут, сбой — 30. */
  voiceWaitWarnSec: 600,
  voiceWaitDownSec: 1800,
  /** Видео или аудио в очереди обработки: внимание — 10 минут, сбой — 30. */
  mediaWaitWarnSec: 600,
  mediaWaitDownSec: 1800,
  /** Окно «за сутки» для счётчиков. */
  daySec: 86_400,
  /** Поток в сбое дольше стольких минут — уведомление руководителям; повтор — не чаще раза в alertEveryMin. */
  alertAfterMin: 10,
  alertEveryMin: 60,
  /** Автообновление страницы, секунд. */
  refreshSec: 20,
} as const;

/** Подписи цифр в карточках (ключи метрик — те же в ответе API v1). */
export const OPS_METRIC_LABEL = {
  workerSeen: "Последний признак жизни",
  outboxPending: "Ждут доставки",
  outboxDueAge: "Самое старое ждёт",
  outboxRetrying: "Повторяются",
  outboxDead: "В разборе (попытки кончились)",
  outboxHour: "Доставлено за час",
  kaspiCashier: "Кассир",
  waErrorsHour: "Ошибок отправки за час",
  waErrorsDay: "Ошибок отправки за сутки",
  waPending: "Висят «отправляется»",
  voicesWaiting: "Голосовых ждут расшифровки",
  voicesAge: "Самое старое голосовое ждёт",
  mediaQueued: "В очереди",
  mediaAge: "Самое старое ждёт",
  mediaFailedDay: "Не обработано за сутки",
  mailSentDay: "Автописем за сутки",
  mailLastSent: "Последнее автописьмо",
} as const;

export type OpsMetric = keyof typeof OPS_METRIC_LABEL;

/** Как показывать цифру: штуки, длительность в секундах, момент времени (ISO), текст. */
export type OpsMetricUnit = "count" | "age" | "time" | "text";

/** Тексты сигналов и уведомлений (подстановки — {n}, {age}, {job}, {text}). */
export const OPS_TEXT = {
  stale: "«{job}»: нет прохода {age}",
  running: "«{job}» идёт {age}",
  fails: "«{job}»: ошибка {n} раз подряд — {text}",
  recentError: "«{job}»: была ошибка {age} назад — {text}",
  neverRan: "«{job}»: проходов ещё не было",
  outboxDue: "Событие ждёт доставки {age}",
  outboxRetrying: "Повторяются событий: {n} — {text}",
  outboxDead: "Событий в разборе: {n}, последнее — {text}",
  kaspiDown: "Кассир Kaspi не работает {age}: оплаты не подтверждаются сами",
  kaspiWarn: "Кассир Kaspi не отвечает {age}",
  waErrors: "Не отправлено сообщений за час: {n} — {text}",
  waPending: "Сообщений висит «отправляется» дольше 10 минут: {n}",
  voicesWait: "Голосовое ждёт расшифровки {age}",
  mediaWait: "Видео или аудио ждёт обработки {age}",
  mediaFailed: "Не обработано за сутки: {n} — {text}",
  mailOff: "Автописьма клиентам выключены (Почта → «Автописьма»)",
  passStale: "Шаги не идут: стоит «{job}» — см. «Планировщик»",
  printFailed: "Заказ №{n}: файлы для типографии не собрались — скачивание соберёт заново",
  cashierOk: "работает",
  cashierDown: "не работает",
  alertTitle: "Сбой фона: {text}",
  alertBody: "{text}. Подробности — «Фон и очереди».",
  recoveredTitle: "Фон снова в норме: {text}",
} as const;

/** Подставить значения в текст OPS_TEXT. */
export function opsText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** «40 с», «7 мин», «2 ч 5 мин», «3 дн». */
export function opsAge(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} с`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} ч${min % 60 ? ` ${min % 60} мин` : ""}`;
  return `${Math.floor(h / 24)} дн`;
}

/** Через сколько секунд без прохода задание — «внимание» и «сбой». */
export function opsStaleAfter(every: number): { warn: number; down: number } {
  const t = OPS_THRESHOLDS;
  return { warn: Math.max(every * t.staleWarnFactor, every + t.staleWarnSlackSec), down: Math.max(every * t.staleDownFactor, every + t.staleDownSlackSec) };
}

/** Страница CRM: заголовок, пояснение и подписи. */
export const OPS_PAGE = {
  href: "/admin/system",
  title: "Фон и очереди",
  lead: "Жив ли фон и не застряло ли что-нибудь: планировщик, очередь событий, сверка Kaspi, WhatsApp, ИИ, видео, письма и файлы для печати. Поток в сбое дольше 10 минут — уведомление руководителям, не чаще раза в час.",
  updated: "Обновлено",
  refresh: "Обновить",
  issues: "Что сейчас не так",
  allOk: "Все потоки в норме: фон идёт, очереди не застряли.",
  jobs: "Задания",
  job: "Задание",
  state: "Состояние",
  lastOk: "Последний успех",
  lastRun: "Последний проход",
  lastError: "Последняя ошибка",
  failsInRow: "раз подряд",
  running: "идёт",
  never: "ещё не было",
  ago: "назад",
  errors: "Последние ошибки",
  every: "раз в",
  onEvent: "по событию",
  loadError: "Не удалось обновить сводку — показаны прежние данные, повторим автоматически.",
} as const;
