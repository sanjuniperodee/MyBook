/**
 * Примечание к сделке — свободный текст сотрудников в карточке (что важно помнить о клиенте и договорённостях).
 * Не лента и не сообщение клиенту: одно поле, последняя правка заменяет прежний текст.
 */
export const DEAL_NOTE_MAX = 4000;

/** Текст примечания к сохранению: переводы строк одного вида, без пустых строк по краям, не длиннее DEAL_NOTE_MAX. */
export function normalizeDealNote(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/^\s*\n|\s+$/g, "").slice(0, DEAL_NOTE_MAX);
}

/** Примечание слитой сделки дописывается к примечанию той, в которую слили (с пустой строкой между ними). */
export function mergeDealNotes(target: string, source: string): string {
  return normalizeDealNote([target, source].map((t) => t.trim()).filter(Boolean).join("\n\n"));
}
