import "server-only";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { zonedDay, fromZonedTime } from "@/shared/domain/time";

/** Поля, которые AI заполняет сам — только пустые: дата события, для кого, повод (bots-4). */
export const AUTOFILL_KEYS = ["event_date", "recipient", "occasion"] as const;
/** Диалогов за проход (раз в 15 минут) и в сутки: внешний API — не больше этого. */
export const AUTOFILL_BATCH = 5;
export const AUTOFILL_PER_DAY = 100;

export interface AutofillDeps {
  enabled(): Promise<boolean>;
  configured(): Promise<boolean>;
  /** Сколько диалогов уже разобрано сегодня. */
  parsedToday(): Promise<number>;
  candidates(limit: number): Promise<{ conversationId: string; dealId: string }[]>;
  markParsed(conversationId: string): Promise<void>;
  /** Предложения модели по своим полям сделки (как кнопка «Заполнить из переписки»). */
  extract(dealId: string): Promise<{ key: string; label: string; value: string | number }[]>;
  /** Текущие значения полей сделки. */
  fields(dealId: string): Promise<Record<string, unknown> | null>;
  fillEmpty(dealId: string, values: Record<string, string | number>): Promise<void>;
  note(dealId: string, text: string): Promise<void>;
  audit(dealId: string, values: Record<string, string | number>): Promise<void>;
  logError(err: unknown): void;
}

const empty = (v: unknown) => v === undefined || v === null || v === "";

/**
 * Автозаполнение пустых полей сделки из переписки менеджера (bots-4): менеджеры отвечают с телефона магазина и не
 * вписывают в сделку дату события, получателя и повод — а от них зависят «Успеть к дате», годовщины и праздники. Раз в
 * 15 минут до 5 затихших диалогов (не больше 100 в сутки): один запрос к модели помощника, в сделку — только пустые из
 * трёх полей, запись в ленту сделки и журнал deal.fields_ai. Отметка разбора ставится до запроса: ошибка модели не
 * зацикливает диалог, следующий разбор — после нового сообщения. Выключатель — «Интеграции» → AI.
 */
export async function aiAutofill(d: AutofillDeps): Promise<number> {
  if (!(await d.enabled()) || !(await d.configured())) return 0;
  const left = AUTOFILL_PER_DAY - (await d.parsedToday());
  if (left <= 0) return 0;
  let filled = 0;
  for (const c of await d.candidates(Math.min(AUTOFILL_BATCH, left))) {
    await d.markParsed(c.conversationId);
    try {
      const current = await d.fields(c.dealId);
      if (!current) continue;
      const proposals = (await d.extract(c.dealId)).filter((p) => (AUTOFILL_KEYS as readonly string[]).includes(p.key) && empty(current[p.key]) && !empty(p.value));
      if (!proposals.length) continue;
      const values = Object.fromEntries(proposals.map((p) => [p.key, p.value]));
      await d.fillEmpty(c.dealId, values);
      await d.note(c.dealId, `AI заполнил из переписки: ${proposals.map((p) => `${p.label} — ${p.value}`).join(", ")}. Проверьте, если что-то не так.`);
      await d.audit(c.dealId, values);
      filled++;
    } catch (err) {
      d.logError(err);
    }
  }
  return filled;
}

/** Порты из контекстов: переписка (выборка и отметка), помощник (модель), продажи (поля), журнал. */
export function aiAutofillDeps(now = new Date()): AutofillDeps {
  const c = container();
  return {
    enabled: async () => (await getSetting("ai.autofill")) !== "off",
    configured: () => c.assistant.service.configured(),
    parsedToday: () => c.messaging.autofill.parsedSince(fromZonedTime(`${zonedDay(now)}T00:00`)),
    candidates: (limit) => c.messaging.autofill.candidates(limit, now),
    markParsed: (id) => c.messaging.autofill.markParsed(id, now),
    extract: async (dealId) => (await c.assistant.service.extractDealFields(dealId)).proposals,
    fields: async (dealId) => (await c.sales.deals.findById(dealId))?.customFields ?? null,
    fillEmpty: (dealId, values) => c.sales.deals.fillEmptyFields(dealId, values),
    note: async (dealId, text) => {
      const deal = await c.sales.deals.findById(dealId);
      if (deal) await c.sales.deals.note(deal, text, null);
    },
    audit: (dealId, values) => c.access.audit.record({ actorId: null, action: "deal.fields_ai", entity: "deal", entityId: dealId, details: { ...values, auto: true } }),
    logError: (err) => console.error("[ai autofill]", err),
  };
}
