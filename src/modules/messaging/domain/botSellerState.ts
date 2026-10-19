/** Состояние AI-беседы продажника (внутри BotState.ai). Отдельный файл: его читают и движок, и продажник. */
export const SELLER_STAGES = ["greeting", "discovery", "offer", "objection", "closing", "agreed", "handoff", "lost"] as const;
export type SellerStage = (typeof SELLER_STAGES)[number];

/** Что бот-продажник помнит о беседе. */
export interface SellerAiState {
  /** Сколько раз модель отвечала в этой беседе (потолок — sell.maxTurns). */
  turns: number;
  /** Бот или менеджер уже называли цену клиенту (можно выставлять счёт). */
  priceQuoted: boolean;
  /** Последний ответ бота прямо предлагал оформить («Оформляем?») — «да» после него согласие. */
  closeAsked: boolean;
  /** Сколько возражений прозвучало (цена, «подумаю»…). */
  objections: number;
  /** Подхват начатой переписки: менеджер не ответил за N минут. */
  takeover: boolean;
  /** Сколько минут клиент ждал, когда бот подхватил. */
  waitedMinutes: number;
  /** Сколько раз ответ модели не прошёл проверку (цена не из тарифов и т. п.). */
  blocked: number;
  /** Сколько раз подряд модель не ответила (ошибка, таймаут). */
  failures: number;
  /** Краткая заметка модели о клиенте — в сводку менеджеру. */
  summary: string;
  /** Дата, к которой клиенту нужна книга (если в сделке нет поля-даты, помним здесь). */
  eventDate: string | null;
  stage: SellerStage;
  /** Сколько напоминаний молчащему клиенту уже отправлено (максимум SELLER_MAX_FOLLOW_UPS). */
  followUps: number;
  /** Модель распознавания не умеет вложения (нет vision/аудио) — в этой беседе больше не пробуем. */
  mediaFailed: boolean;
  /** Город клиента (для срока: по Алматы доставка в день готовности). */
  city: string;
  /** Сколько раз клиент спрашивал цену, пока её называет только менеджер: на повторе — менеджеру. */
  priceAsks: number;
  /** Распознанные голосовые и фото (id сообщения → текст): в следующих ходах модель видит их, а не «[голосовое]». */
  media: Record<string, string>;
  /** Менеджер уже знает, что клиент замолчал на знакомстве (заметка и уведомление) — второй раз не пишем. */
  silenceNoted: boolean;
  /** Подборка материалов (фото, видео, пример книги) уже ушла клиенту — второй раз не шлём. */
  materialsSent: boolean;
  /**
   * Клиент прогрет: в прошлом ходе ему ушла подборка (или, если подборки нет, рассказ о ценности книги). До этого бот
   * не называет цену и не предлагает оформить — сначала клиент знакомится (владелец, 19.10).
   */
  warmedUp: boolean;
  /** Клиент сам спросил про электронную версию: её можно предлагать, не дожидаясь второго «дорого». */
  digitalAsked: boolean;
  /** Бот напишет клиенту повторно (bots-5): в названное им время или в последний день, чтобы успеть к дате; null — нет. */
  remind: SellerRemind | null;
  /** Сколько раз бот уже писал повторно по договорённости или в последний день (потолок — sell.remindTouches). */
  touches: number;
}

/**
 * Повторное сообщение клиенту: promised — клиент сам назвал, когда ему написать («после зарплаты», «в пятницу»),
 * last_start — тёплому неоплатившему с датой события в последний день, когда ещё можно начать и успеть.
 */
export interface SellerRemind {
  kind: "promised" | "last_start";
  /** Когда написать (ISO): уже в рабочее время, не позже даты события. */
  at: string;
  /** Повод словами клиента («после зарплаты»), для last_start — дата события; для менеджера и модели. */
  why: string;
  /**
   * Когда договорились (для last_start — когда назначил код) или клиент последний раз подтвердил договорённость (ISO).
   * Клиент написал позже — разговор продолжился: в срок бот не пишет «как и договаривались», договорённость снимается.
   */
  setAt: string;
}

/** Сколько раз продажник напоминает о себе молчащему клиенту: тёплому — три раза, остальным — два. */
export const SELLER_MAX_FOLLOW_UPS = 3;
/** Первое напоминание тёплому клиенту — как у менеджера: «Ознакомились?» через 10–20 минут после материалов и цены. */
export const WARM_FIRST_FOLLOW_UP_MS = 20 * 60_000;

/** Тёплый клиент: получил подборку, слышал цену, назвал дату или дошёл до предложения — напоминаем чаще. */
export function isWarmLead(ai: SellerAiState): boolean {
  return ai.materialsSent || ai.priceQuoted || !!ai.eventDate || ai.stage === "offer" || ai.stage === "objection" || ai.stage === "closing";
}

/**
 * Через сколько после последнего сообщения бота напомнить о себе; null — больше не напоминаем.
 * Тёплому: через 20 минут («Ознакомились? 😊»), через followUpHours («Освободились?») и на следующий день. Остальным:
 * через followUpHours и на следующий день. followUpHours = 0 — напоминания выключены владельцем.
 */
export function followUpDelayMs(ai: SellerAiState, followUpHours: number, nextDayMs: number): number | null {
  if (followUpHours <= 0) return null;
  const hours = followUpHours * 3_600_000;
  const steps = isWarmLead(ai) ? [WARM_FIRST_FOLLOW_UP_MS, hours, nextDayMs] : [hours, nextDayMs];
  return steps[ai.followUps] ?? null;
}

export const newSellerAiState = (): SellerAiState => ({
  turns: 0,
  priceQuoted: false,
  closeAsked: false,
  objections: 0,
  takeover: false,
  waitedMinutes: 0,
  blocked: 0,
  failures: 0,
  summary: "",
  eventDate: null,
  stage: "greeting",
  followUps: 0,
  mediaFailed: false,
  city: "",
  priceAsks: 0,
  media: {},
  silenceNoted: false,
  materialsSent: false,
  remind: null,
  touches: 0,
  warmedUp: false,
  digitalAsked: false,
});

/** Состояние из базы: недостающее — по умолчанию (запись сделана прежней версией). */
export const readSellerAi = (raw: unknown): SellerAiState => ({ ...newSellerAiState(), ...(raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<SellerAiState>) : {}) });
