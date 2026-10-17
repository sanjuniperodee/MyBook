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
}

/** Сколько раз продажник напоминает о себе молчащему клиенту (как менеджер: «Ознакомились?» → на следующий день «Как ваши дела?»). */
export const SELLER_MAX_FOLLOW_UPS = 2;

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
});

/** Состояние из базы: недостающее — по умолчанию (запись сделана прежней версией). */
export const readSellerAi = (raw: unknown): SellerAiState => ({ ...newSellerAiState(), ...(raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<SellerAiState>) : {}) });
