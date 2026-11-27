import "server-only";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { zonedDay, fromZonedTime } from "@/shared/domain/time";
import { AI_CARD_SKIP_FIELDS, aiFlagOn, parseStaffChatNames } from "@/shared/domain/aiCrm";
import { aiNoteText, type AiFieldPayload } from "@/shared/domain/aiProposals";
import { nameInText } from "@/shared/domain/aiStages";

/** Поля, которые AI заполняет сам — только пустые: дата события, для кого, повод (bots-4). */
export const AUTOFILL_KEYS = ["event_date", "recipient", "occasion"] as const;
/** Диалогов за проход (раз в 15 минут) и в сутки: внешний API — не больше этого. */
export const AUTOFILL_BATCH = 5;
export const AUTOFILL_PER_DAY = 100;
/** Ключ имени клиента в запросе к модели (не своё поле сделки — пишется в имя контакта). */
export const CONTACT_NAME_KEY = "contact_name";
/** Текстовые поля, замену которых ИИ предлагает: договорённости меняются по ходу разговора. */
export const PROPOSE_TEXT_FIELDS: readonly string[] = ["agreements"];
/** «Другой повод» и подобные: заменить им конкретное значение — потеря данных, такое не предлагаем. */
const GENERIC_OPTION = /^друг(?:ой|ая|ое)(?:\s|$)/i;

export interface AutofillDeps {
  enabled(): Promise<boolean>;
  /** «ИИ в CRM» → «Заполняет карточку сделки»: все свои поля и имя клиента, вписанное — предложением. */
  card(): Promise<boolean>;
  configured(): Promise<boolean>;
  /** Сколько диалогов уже разобрано сегодня. */
  parsedToday(): Promise<number>;
  candidates(limit: number): Promise<{ conversationId: string; dealId: string }[]>;
  markParsed(conversationId: string): Promise<void>;
  /** Предложения модели по своим полям сделки (как кнопка «Заполнить из переписки»); withName — и имя клиента. */
  extract(dealId: string, withName: boolean): Promise<{ key: string; label: string; type?: string; value: string | number }[]>;
  /** Текущие значения полей сделки. */
  fields(dealId: string): Promise<Record<string, unknown> | null>;
  fillEmpty(dealId: string, values: Record<string, string | number>): Promise<void>;
  /** Имя клиента вместо заглушки из мессенджера; false — имя уже настоящее. */
  nameContact(dealId: string, name: string): Promise<boolean>;
  /** Имена сотрудников: модель иногда берёт за имя клиента «Меня зовут Индира» менеджера — такое не ставим. */
  staffNames(): Promise<string[]>;
  propose(dealId: string, payload: AiFieldPayload): Promise<boolean>;
  note(dealId: string, text: string): Promise<void>;
  audit(dealId: string, values: Record<string, string | number>): Promise<void>;
  logError(err: unknown): void;
}

const empty = (v: unknown) => v === undefined || v === null || v === "";
const same = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * Автозаполнение полей сделки из переписки менеджера (bots-4): менеджеры отвечают с телефона магазина и не вписывают
 * в сделку дату события, получателя и повод — а от них зависят «Успеть к дате», годовщины и праздники. Раз в 15 минут
 * до 5 затихших диалогов (не больше 100 в сутки): один запрос к модели помощника. Без «ИИ в CRM» → карточка — только
 * пустые из трёх полей; с ней — все свои поля сделки (кроме формы оплаты) и имя клиента вместо заглушки из мессенджера,
 * а вписанное человеком значение, с которым модель не согласна, — предложением замены (кнопка в карточке). Запись в ленту
 * сделки и журнал deal.fields_ai. Отметка разбора ставится до запроса: ошибка модели не зацикливает диалог, следующий
 * разбор — после нового сообщения. Выключатель — «Интеграции» → AI.
 */
export async function aiAutofill(d: AutofillDeps): Promise<number> {
  if (!(await d.enabled()) || !(await d.configured())) return 0;
  const left = AUTOFILL_PER_DAY - (await d.parsedToday());
  if (left <= 0) return 0;
  const card = await d.card();
  let filled = 0;
  for (const c of await d.candidates(Math.min(AUTOFILL_BATCH, left))) {
    await d.markParsed(c.conversationId);
    try {
      const current = await d.fields(c.dealId);
      if (!current) continue;
      const found = (await d.extract(c.dealId, card)).filter((p) => !empty(p.value) && !AI_CARD_SKIP_FIELDS.includes(p.key));
      const own = found.filter((p) => p.key !== CONTACT_NAME_KEY && (card || (AUTOFILL_KEYS as readonly string[]).includes(p.key)));
      const fill = own.filter((p) => empty(current[p.key]));
      const lines = fill.map((p) => `${p.label} — ${p.value}`);
      const values = Object.fromEntries(fill.map((p) => [p.key, p.value]));
      if (fill.length) await d.fillEmpty(c.dealId, values);
      const named = card ? found.find((p) => p.key === CONTACT_NAME_KEY) : undefined;
      const name = named && !(await d.staffNames()).some((s) => nameInText(s, String(named.value))) ? named : undefined;
      if (name && (await d.nameContact(c.dealId, String(name.value)))) lines.push(`Имя клиента — ${name.value}`);
      if (lines.length) {
        await d.note(c.dealId, card ? aiNoteText("заполнил из переписки", lines.join(", "), null) : `AI заполнил из переписки: ${lines.join(", ")}. Проверьте, если что-то не так.`);
        if (fill.length) await d.audit(c.dealId, values);
        filled++;
      }
      // Вписанное человеком не перезаписываем: модель видит иначе — предложение замены. Только для полей, где разница —
      // это смысл (список, дата, число) и для договорённостей; свободный текст («Парню» / «Жигіту») — не предлагаем.
      if (card)
        for (const p of own.filter((x) => !empty(current[x.key]) && !same(current[x.key], x.value) && (x.type !== "text" || PROPOSE_TEXT_FIELDS.includes(x.key)) && !GENERIC_OPTION.test(String(x.value))))
          await d.propose(c.dealId, { key: p.key, label: p.label, from: String(current[p.key]), to: p.value });
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
    card: async () => aiFlagOn("crm.aiCard", await getSetting("crm.aiCard")),
    configured: () => c.assistant.service.configured(),
    parsedToday: () => c.messaging.autofill.parsedSince(fromZonedTime(`${zonedDay(now)}T00:00`)),
    candidates: (limit) => c.messaging.autofill.candidates(limit, now),
    markParsed: (id) => c.messaging.autofill.markParsed(id, now),
    extract: async (dealId, withName) => (await c.assistant.service.extractDealFields(dealId, withName ? { extra: [{ key: CONTACT_NAME_KEY, label: "Имя клиента", type: "text", options: [] }] } : {})).proposals,
    fields: async (dealId) => (await c.sales.deals.findById(dealId))?.customFields ?? null,
    fillEmpty: (dealId, values) => c.sales.deals.fillEmptyFields(dealId, values),
    nameContact: (dealId, name) => c.sales.deals.nameContact(dealId, name),
    staffNames: async () => [...(await c.access.queries.allStaff()).map((x) => x.name.trim()), ...Object.values(parseStaffChatNames(await getSetting("crm.staffChatNames"))).flat()].filter(Boolean),
    propose: (dealId, payload) => c.sales.aiProposals.add({ dealId, kind: "field", payload, reason: "в переписке по-другому, чем в карточке", quote: null, messageId: null, confidence: 0.8 }),
    note: async (dealId, text) => {
      const deal = await c.sales.deals.findById(dealId);
      if (deal) await c.sales.deals.note(deal, text, null);
    },
    audit: (dealId, values) => c.access.audit.record({ actorId: null, action: "deal.fields_ai", entity: "deal", entityId: dealId, details: { ...values, auto: true } }),
    logError: (err) => console.error("[ai autofill]", err),
  };
}
