/**
 * «ИИ в CRM»: выключатели того, что ИИ делает за менеджеров, — один список для сервера, страницы настроек и приложения.
 * Каждый — своя настройка crm_settings; по умолчанию всё выключено. «Двигает этапы» — crm.aiStages (JSON { on }, см.
 * aiStages.ts), остальные — "on" | "off".
 */
export const AI_CRM_FLAGS = [
  {
    key: "crm.aiStages",
    label: "Двигает сделки по этапам",
    about:
      "Читает свежую переписку и переводит сделку между этапами разговора и в отказ по словам клиента; оплату, книгу, возврат из отказа и «заказ выдан» предлагает в карточке сделки кнопкой «Применить».",
  },
  {
    key: "crm.aiManager",
    label: "Определяет менеджера",
    about:
      "С телефона магазина пишут разные сотрудники. Если в переписке сотрудник представился («меня зовут Индира»), ИИ назначает его ответственным за сделку и приписывает ему сообщения с телефона магазина; если по имени обратился клиент — предлагает.",
  },
  {
    key: "crm.aiTranscribe",
    label: "Расшифровывает все голосовые",
    about: "Входящие и исходящие голосовые WhatsApp сразу превращаются в текст: он виден в чате, и по нему ИИ понимает переписку. Модель — «Интеграции» → «Голосовые и фото».",
  },
] as const;

export type AiCrmFlagKey = (typeof AI_CRM_FLAGS)[number]["key"];
export const isAiCrmFlag = (v: unknown): v is AiCrmFlagKey => AI_CRM_FLAGS.some((f) => f.key === v);

/** Включён ли выключатель по сохранённому значению: crm.aiStages — JSON { on }, остальные — "on". */
export function aiFlagOn(key: AiCrmFlagKey, raw: string | null | undefined): boolean {
  if (key === "crm.aiStages") {
    try {
      const v: unknown = JSON.parse(raw || "{}");
      return !!v && typeof v === "object" && (v as Record<string, unknown>).on === true;
    } catch {
      return false;
    }
  }
  return raw === "on";
}

/** Значение для сохранения. */
export const aiFlagValue = (key: AiCrmFlagKey, on: boolean) => (key === "crm.aiStages" ? JSON.stringify({ on }) : on ? "on" : "off");

/** Расшифровка голосовых: за проход (раз в минуту) и за сколько дней назад брать нерасшифрованные. */
export const AI_TRANSCRIBE = { batch: 10, lookbackDays: 3 } as const;
