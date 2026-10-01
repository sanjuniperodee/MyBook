/**
 * Телефоны в CRM храним как цифры в международном формате без «+» (77011234567):
 * так сходятся номера из заказов, WhatsApp (Wazzup) и АТС, где формат у всех свой.
 */
export function normalizePhone(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  // Казахстан/Россия: 8XXXXXXXXXX → 7XXXXXXXXXX, 10 цифр без кода страны → 7 + номер.
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  else if (d.length === 10 && /^[3-9]/.test(d)) d = `7${d}`;
  return d;
}

/** Похож ли идентификатор на телефон (для WhatsApp chatId — да, для Instagram-логина — нет). */
export function isPhoneLike(raw: string | null | undefined) {
  const d = normalizePhone(raw);
  return d.length >= 10 && d.length <= 15 && /^[\d\s()+-]+$/.test(String(raw ?? "").trim());
}

/** +7 701 123 45 67 — для отображения. Незнакомые форматы — «+цифры». */
export function formatPhone(raw: string | null | undefined): string {
  const d = normalizePhone(raw);
  if (!d) return "";
  if (d.length === 11 && d.startsWith("7")) return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  return `+${d}`;
}

/** Последние 10 цифр — ключ для сравнения номеров, записанных по-разному. */
export const phoneKey = (raw: string | null | undefined) => normalizePhone(raw).slice(-10);
