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
