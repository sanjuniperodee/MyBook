/** Подпись сотрудника в CRM — чистая функция, годится и для клиентских компонентов. */
export function staffLabel(a: { name: string; email: string } | null | undefined) {
  if (!a) return "—";
  return a.name && a.name !== "Администратор" ? a.name : a.email.split("@")[0];
}

/** Скрывает середину телефона: +7 701 ••• •• 78. */
export function maskPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "•••";
  return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ••• •• ${digits.slice(-2)}`;
}

/** Скрывает e-mail: al•••@gmail.com. */
export function maskEmail(email: string | null | undefined) {
  if (!email) return "";
  const [name, domain] = email.split("@");
  if (!domain) return "•••";
  return `${name.slice(0, 2)}•••@${domain}`;
}
