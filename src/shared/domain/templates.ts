/** Переменные в текстах автоматизаций и шаблонов. Общие для правил автоматизаций, бота в чатах, быстрых ответов и настроек. */
export const templateVars = ["{имя}", "{заказ}", "{ссылка}", "{менеджер}", "{повод}", "{дата}", "{Название своего поля}"] as const;

export function fillTemplate(
  text: string,
  vars: { name?: string | null; order?: string | number | null; link?: string | null; manager?: string | null; occasion?: string | null; date?: string | null; fields?: Record<string, string> },
) {
  // Свои поля сделки: {Для кого}, {Дата события}… (незаполненные — пустая строка).
  let out = text;
  for (const [label, value] of Object.entries(vars.fields ?? {})) out = out.replaceAll(`{${label}}`, value);
  return out
    .replaceAll("{имя}", (vars.name ?? "").trim() || "")
    .replaceAll("{заказ}", vars.order != null ? String(vars.order) : "")
    .replaceAll("{ссылка}", vars.link ?? "")
    .replaceAll("{менеджер}", vars.manager ?? "")
    .replaceAll("{повод}", vars.occasion ?? "")
    .replaceAll("{дата}", vars.date ?? "")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/,([!?.])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Готовый текст клиенту в истории сделки (действие правила «Подготовить текст клиенту»): CRM его не отправляет —
 * менеджер отправляет сам, с телефона магазина или из чата. Заметка начинается с метки, текст — со второй строки.
 */
const DRAFT_NOTE_MARK = "Текст клиенту — отправьте сами";

export const draftNote = (rule: string, text: string) => `${DRAFT_NOTE_MARK} (правило «${rule}»):\n${text}`;

/** Текст клиенту из такой заметки; другая заметка — null. */
export function draftFromNote(note: string): string | null {
  if (!note.startsWith(DRAFT_NOTE_MARK)) return null;
  const i = note.indexOf("\n");
  return i < 0 ? null : note.slice(i + 1).trim() || null;
}

/**
 * wa.me с готовым текстом: с номером (цифры) — сразу чат клиента в WhatsApp телефона магазина; без номера (сотруднику
 * он скрыт) — WhatsApp спросит, кому отправить.
 */
export const whatsappLink = (text: string, phoneDigits?: string | null) => `https://wa.me/${phoneDigits?.replace(/\D/g, "") ?? ""}?text=${encodeURIComponent(text)}`;
