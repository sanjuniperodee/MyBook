/**
 * Контакты клиентов для адресной книги телефона магазина (contacts-10, platform-10): WhatsApp на этом телефоне
 * показывает имя из контактов, а не голый номер. vCard 3.0 — его понимают iPhone, Android и Google Контакты.
 */
export interface VcardContact {
  /** Как подписать: «Айгерим · MB123 · День рождения». */
  name: string;
  /** Телефоны цифрами (77011234567), первый — основной. */
  phones: string[];
  note?: string;
}

/** Экранирование значения vCard: обратная косая, запятая, точка с запятой, перевод строки. */
const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** Подпись контакта: имя, номер последней сделки и повод — чтобы по входящему в WhatsApp было видно, кто это. */
export function vcardName(c: { name: string; dealNumber: number | null; occasion: string | null; phone: string }) {
  return [c.name.trim() || `+${c.phone}`, c.dealNumber ? `MB${c.dealNumber}` : null, c.occasion?.trim() || null].filter(Boolean).join(" · ");
}

export function toVcard(contacts: readonly VcardContact[]): string {
  const cards = contacts
    .filter((c) => c.phones.length)
    .map((c) => {
      const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(c.name)}`, `N:;${esc(c.name)};;;`, ...c.phones.map((p, i) => `TEL;TYPE=${i ? "CELL" : "CELL,PREF"}:+${p.replace(/\D/g, "")}`)];
      if (c.note) lines.push(`NOTE:${esc(c.note)}`);
      lines.push("END:VCARD");
      return lines.join("\r\n");
    });
  return cards.length ? `${cards.join("\r\n")}\r\n` : "";
}
