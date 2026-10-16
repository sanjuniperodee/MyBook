/**
 * Реквизиты в тексте сообщения: чужой номер телефона, номер карты, IBAN, ссылка на перевод Kaspi. Так менеджер мог бы
 * увести клиента или оплату мимо компании. Номер магазина и самого клиента — не находка.
 */
export type SensitiveKind = "phone" | "card" | "iban" | "kaspi";

export interface SensitiveFinding {
  kind: SensitiveKind;
  /** Найденное — для журнала и уведомления руководителю. */
  value: string;
}

export const sensitiveLabels: Record<SensitiveKind, string> = {
  phone: "номер телефона",
  card: "номер карты",
  iban: "IBAN",
  kaspi: "ссылка на перевод Kaspi",
};

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Номер карты: 13–19 цифр с верной контрольной суммой (алгоритм Луна). */
function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Казахстанский (и любой +7) номер по последним 10 цифрам. */
const phoneKey = (digits: string) => {
  const key = digits.length === 11 && (digits[0] === "7" || digits[0] === "8") ? digits.slice(1) : digits.length === 10 ? digits : null;
  // Номера Казахстана начинаются на 7 (700…, 771…): «10 000 20 000» — суммы, а не телефон.
  return key && key[0] === "7" ? key : null;
};

/**
 * Находки в тексте. allowedPhones — номера, которые можно писать (магазина, клиента этого чата), в любом виде.
 * Группы цифр через пробел, дефис, скобки и точку считаются одним числом.
 */
export function findSensitive(text: string, allowedPhones: readonly (string | null | undefined)[] = []): SensitiveFinding[] {
  const allowed = new Set(allowedPhones.map((p) => (p ? phoneKey(digitsOf(p)) ?? digitsOf(p).slice(-10) : null)).filter(Boolean));
  const out: SensitiveFinding[] = [];
  const seen = new Set<string>();
  const add = (f: SensitiveFinding) => {
    const key = `${f.kind}:${f.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };

  for (const m of text.matchAll(/\bKZ\s?\d{2}(?:\s?[A-Z0-9]){16}\b/gi)) add({ kind: "iban", value: m[0].replace(/\s/g, "").toUpperCase() });
  for (const m of text.matchAll(/(?:https?:\/\/)?(?:[\w-]+\.)*kaspi\.kz\/(?:pay|transfers?|p2p)\S*/gi)) add({ kind: "kaspi", value: m[0] });

  // Последовательности цифр с разделителями: «+7 (701) 123-45-67», «4400 4301 2345 6789».
  for (const m of text.matchAll(/\+?\d[\d\s().-]{8,30}\d/g)) {
    const digits = digitsOf(m[0]);
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      add({ kind: "card", value: `•••• ${digits.slice(-4)}` });
      continue;
    }
    const key = phoneKey(digits);
    if (key && !allowed.has(key)) add({ kind: "phone", value: m[0].trim() });
  }
  return out;
}
